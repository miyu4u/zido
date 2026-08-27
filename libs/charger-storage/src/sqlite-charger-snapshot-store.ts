import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, StatementSync } from 'node:sqlite'
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import type {
  ChargerSource,
  ChargerStationRecord,
  ChargerStatusRecord,
  EffectiveChargerStatus,
  Freshness,
  MappedChargerStatus,
} from 'zido/charger-domain'
import { ChargerStorageError, toChargerStorageError } from './errors'
import { buildChargerKey, buildStationKey, initSchema } from './schema'
import type {
  ChargerSnapshotStore,
  ChargerStatusInput,
  FindChargersFilter,
  QueryCacheMetadata,
  QuerySnapshotBundle,
  SqliteStoreOptions,
  StationInfoInput,
  WriteQuerySnapshotInput,
} from './types'
import { ChargerSnapshotStore as ChargerSnapshotStoreBase } from './types'

/**
 * ============================================================================
 * SINGLE-NODE SQLITE CHARGER SNAPSHOT STORE IMPLEMENTATION
 * ============================================================================
 * High-performance, single-node SQLite-backed store for caching EV charger
 * snapshots, station catalog data, and charger statuses.
 *
 * Key Design Invariants:
 * 1. Transactional Atomic Writes: writeQuerySnapshot, batch upsertStationInfo,
 *    and batch upsertChargerStatus execute in atomic transactions (BEGIN IMMEDIATE).
 *    On write failure, previous snapshot data and observedAt timestamps are preserved.
 * 2. Typed Lock Error Classification: SQLite busy/lock contentions (SQLITE_BUSY / 5)
 *    are intercepted and mapped directly to CHARGER_STORAGE_LOCKED.
 * 3. Empty Snapshot Distinguishability: A query yielding zero items writes an empty
 *    snapshot record (itemCount = 0). When read, it returns a valid bundle with
 *    itemCount = 0, distinguishable from cache misses / unwritten queries (returns null).
 * 4. Composite Key Idempotency: All stations and chargers are indexed by composite keys:
 *    - Station: (source, operatorId, stationId)
 *    - Charger: (source, operatorId, stationId, chargerId)
 * 5. Secret/Raw XML Redaction: Raw HTTP/XML bodies and API keys are never persisted.
 * ============================================================================
 */
@Injectable()
export class SqliteChargerSnapshotStore extends ChargerSnapshotStoreBase implements OnModuleDestroy {
  private readonly db: DatabaseSync
  private isClosed = false

  // Pre-compiled prepared statements for fast execution
  private readonly stmtUpsertStation: StatementSync
  private readonly stmtUpsertCharger: StatementSync
  private readonly stmtUpsertQueryCache: StatementSync
  private readonly stmtDeleteQueryCacheItems: StatementSync
  private readonly stmtInsertQueryCacheItem: StatementSync
  private readonly stmtGetQueryCache: StatementSync
  private readonly stmtGetChargersForQuery: StatementSync
  private readonly stmtGetStationsForQuery: StatementSync
  private readonly stmtGetStationByKey: StatementSync
  private readonly stmtGetStationById: StatementSync
  private readonly stmtGetChargerByKey: StatementSync
  private readonly stmtGetChargersByStationKey: StatementSync
  private readonly stmtGetChargersByStationId: StatementSync
  private readonly stmtGetChargersFiltered: StatementSync

  constructor(options: SqliteStoreOptions = {}) {
    super()
    const dbPath = options.dbPath ?? ':memory:'
    const busyTimeoutMs = options.busyTimeoutMs ?? 5000
    const walMode = options.walMode ?? true

    try {
      if (dbPath !== ':memory:') {
        const dir = path.dirname(path.resolve(dbPath))
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
      }

      this.db = new DatabaseSync(dbPath)

      // Set concurrency & durability pragmas
      this.db.exec(`PRAGMA busy_timeout = ${Math.max(0, busyTimeoutMs)};`)
      if (dbPath !== ':memory:' && walMode) {
        this.db.exec('PRAGMA journal_mode = WAL;')
      }
      this.db.exec('PRAGMA synchronous = NORMAL;')
      this.db.exec('PRAGMA foreign_keys = ON;')

      // Initialize table schemas and indexes
      initSchema(this.db)

      // Prepare reusable statement instances
      this.stmtUpsertStation = this.db.prepare(`
        INSERT INTO station_info (
          station_key, source, operator_id, station_id, name, address, lat, lng, access,
          source_observed_at, source_version, metadata_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(station_key) DO UPDATE SET
          name = COALESCE(excluded.name, station_info.name),
          address = COALESCE(excluded.address, station_info.address),
          lat = COALESCE(excluded.lat, station_info.lat),
          lng = COALESCE(excluded.lng, station_info.lng),
          access = CASE WHEN excluded.access != 'UNKNOWN' THEN excluded.access ELSE station_info.access END,
          source_observed_at = excluded.source_observed_at,
          source_version = COALESCE(excluded.source_version, station_info.source_version),
          metadata_json = COALESCE(excluded.metadata_json, station_info.metadata_json),
          updated_at = excluded.updated_at;
      `)

      this.stmtUpsertCharger = this.db.prepare(`
        INSERT INTO charger_status (
          charger_key, station_key, source, operator_id, station_id, charger_id,
          raw_status, normalized_status, status, status_updated_at, observed_at, freshness, source_version, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(charger_key) DO UPDATE SET
          station_key       = excluded.station_key,
          raw_status        = excluded.raw_status,
          normalized_status = excluded.normalized_status,
          status            = excluded.status,
          status_updated_at = excluded.status_updated_at,
          observed_at       = excluded.observed_at,
          freshness         = excluded.freshness,
          source_version    = COALESCE(excluded.source_version, charger_status.source_version),
          updated_at        = excluded.updated_at
      `)

      this.stmtUpsertQueryCache = this.db.prepare(`
        INSERT INTO query_cache (
          query_key, source, item_count, observed_at, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(query_key) DO UPDATE SET
          source = excluded.source,
          item_count = excluded.item_count,
          observed_at = excluded.observed_at,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at;
      `)

      this.stmtDeleteQueryCacheItems = this.db.prepare(`
        DELETE FROM query_cache_items WHERE query_key = ?;
      `)

      this.stmtInsertQueryCacheItem = this.db.prepare(`
        INSERT OR REPLACE INTO query_cache_items (query_key, charger_key, station_key)
        VALUES (?, ?, ?);
      `)

      this.stmtGetQueryCache = this.db.prepare(`
        SELECT query_key, source, item_count, observed_at, metadata_json, created_at, updated_at
        FROM query_cache WHERE query_key = ?;
      `)

      this.stmtGetChargersForQuery = this.db.prepare(`
        SELECT c.* FROM charger_status c
        INNER JOIN query_cache_items qi ON c.charger_key = qi.charger_key
        WHERE qi.query_key = ?;
      `)

      this.stmtGetStationsForQuery = this.db.prepare(`
        SELECT DISTINCT s.* FROM station_info s
        INNER JOIN query_cache_items qi ON s.station_key = qi.station_key
        WHERE qi.query_key = ?;
      `)

      this.stmtGetStationByKey = this.db.prepare(`
        SELECT * FROM station_info WHERE station_key = ? LIMIT 1;
      `)

      this.stmtGetStationById = this.db.prepare(`
        SELECT * FROM station_info WHERE station_id = ? LIMIT 1;
      `)

      this.stmtGetChargerByKey = this.db.prepare(`
        SELECT status_updated_at, observed_at
        FROM charger_status
        WHERE charger_key = ? LIMIT 1;
      `)

      this.stmtGetChargersByStationKey = this.db.prepare(`
        SELECT * FROM charger_status WHERE station_key = ?;
      `)

      this.stmtGetChargersByStationId = this.db.prepare(`
        SELECT * FROM charger_status WHERE station_id = ?;
      `)

      this.stmtGetChargersFiltered = this.db.prepare(`
        SELECT * FROM charger_status
        WHERE (? IS NULL OR source = ?)
          AND (? IS NULL OR operator_id = ?)
          AND (? IS NULL OR station_id = ?);
      `)
    } catch (err) {
      throw toChargerStorageError(err, 'Failed to initialize SQLite snapshot store')
    }
  }

  /**
   * Helper to execute operations inside an immediate SQLite transaction.
   */
  private runTransaction<T>(operation: () => T): T {
    if (this.isClosed) {
      throw new ChargerStorageError('CHARGER_STORAGE_CLOSED', 'SQLite snapshot store is closed')
    }

    try {
      this.db.exec('BEGIN IMMEDIATE;')
    } catch (err) {
      throw toChargerStorageError(err, 'Failed to begin transaction')
    }

    try {
      const result = operation()
      this.db.exec('COMMIT;')
      return result
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;')
      } catch {
        // Rollback error swallowed to preserve original fault
      }
      throw toChargerStorageError(err, 'Transaction rolled back due to error')
    }
  }

  /**
   * Rejects late provider observations before they can regress a newer row.
   * KECO compact timestamps and ISO timestamps are normalized by the domain
   * parser; invalid incoming timestamps never extend an existing row.
   */
  private shouldAcceptChargerUpdate(
    chargerKey: string,
    statusUpdatedAt: string | null | undefined,
    observedAt: string,
  ): boolean {
    const existing = this.stmtGetChargerByKey.get(chargerKey) as
      { status_updated_at?: string | null; observed_at?: string | null } | undefined
    if (!existing) return true

    const incomingStatus = parseStorageTimestamp(statusUpdatedAt)
    const existingStatus = parseStorageTimestamp(existing.status_updated_at)
    if (incomingStatus && existingStatus) {
      const statusDelta = incomingStatus.getTime() - existingStatus.getTime()
      if (statusDelta !== 0) {
        return statusDelta > 0
      }
    } else if (incomingStatus && !existingStatus) {
      return true
    } else if (!incomingStatus && existingStatus) {
      return false
    }

    const incomingObserved = parseStorageTimestamp(observedAt)
    const existingObserved = parseStorageTimestamp(existing.observed_at)
    if (incomingObserved && existingObserved) {
      return incomingObserved.getTime() >= existingObserved.getTime()
    }
    if (incomingObserved && !existingObserved) return true
    return false
  }

  /**
   * Reads a cached query snapshot bundle by opaque queryKey.
   */
  public async readQuerySnapshot(
    queryKey: string,
    options?: { ttlMs?: number; now?: string | Date },
  ): Promise<QuerySnapshotBundle | null> {
    if (this.isClosed) {
      throw new ChargerStorageError('CHARGER_STORAGE_CLOSED', 'SQLite snapshot store is closed')
    }

    try {
      const cacheRow = this.stmtGetQueryCache.get(queryKey) as
        | {
            query_key: string
            source: string
            item_count: number | bigint
            observed_at: string
            metadata_json: string | null
            created_at: string
            updated_at: string
          }
        | undefined

      if (!cacheRow) {
        return null
      }

      const observedAt = cacheRow.observed_at
      let isStale = false

      if (typeof options?.ttlMs === 'number' && options.ttlMs >= 0) {
        const nowMs =
          typeof options.now === 'string'
            ? new Date(options.now).getTime()
            : options.now instanceof Date
              ? options.now.getTime()
              : Date.now()
        const observedMs = new Date(observedAt).getTime()

        if (!Number.isFinite(nowMs) || !Number.isFinite(observedMs) || nowMs - observedMs > options.ttlMs) {
          isStale = true
        }
      }

      // Fetch chargers and stations associated with this query snapshot
      const rawChargers = this.stmtGetChargersForQuery.all(queryKey) as Array<Record<string, unknown>>
      const rawStations = this.stmtGetStationsForQuery.all(queryKey) as Array<Record<string, unknown>>

      const chargers: ChargerStatusRecord[] = rawChargers.map((r) => ({
        source: String(r.source) as ChargerSource,
        operatorId: r.operator_id !== null && r.operator_id !== undefined ? String(r.operator_id) : null,
        stationId: String(r.station_id),
        chargerId: String(r.charger_id),
        rawStatus: r.raw_status !== null && r.raw_status !== undefined ? String(r.raw_status) : null,
        normalizedStatus: (r.normalized_status as MappedChargerStatus) ?? null,
        status: (r.status as EffectiveChargerStatus) ?? 'UNKNOWN',
        statusUpdatedAt:
          r.status_updated_at !== null && r.status_updated_at !== undefined ? String(r.status_updated_at) : null,
        observedAt: String(r.observed_at),
        freshness: (r.freshness as Freshness) ?? 'UNKNOWN',
        sourceVersion: r.source_version !== null && r.source_version !== undefined ? String(r.source_version) : null,
      }))

      // Group chargers by station key for station records
      const chargerMapByStationKey = new Map<string, ChargerStatusRecord[]>()
      for (const charger of chargers) {
        const stKey = buildStationKey(charger.source, charger.operatorId, charger.stationId)
        const list = chargerMapByStationKey.get(stKey) ?? []
        list.push(charger)
        chargerMapByStationKey.set(stKey, list)
      }

      const stations: ChargerStationRecord[] = rawStations.map((s) => {
        const stationKey = String(s.station_key)
        const stationChargers = chargerMapByStationKey.get(stationKey) ?? []
        return {
          source: String(s.source) as ChargerSource,
          operatorId: s.operator_id !== null && s.operator_id !== undefined ? String(s.operator_id) : null,
          stationId: String(s.station_id),
          name: s.name !== null && s.name !== undefined ? String(s.name) : null,
          address: s.address !== null && s.address !== undefined ? String(s.address) : null,
          location:
            s.lat !== null && s.lat !== undefined && s.lng !== null && s.lng !== undefined
              ? { lat: Number(s.lat), lng: Number(s.lng) }
              : null,
          access: (s.access as 'PUBLIC' | 'RESTRICTED' | 'UNKNOWN') ?? 'UNKNOWN',
          chargers: stationChargers,
          sourceObservedAt: String(s.source_observed_at),
          sourceVersion: s.source_version !== null && s.source_version !== undefined ? String(s.source_version) : null,
        }
      })

      return {
        queryKey,
        source: String(cacheRow.source) as ChargerSource,
        observedAt,
        isStale,
        itemCount: Number(cacheRow.item_count),
        stations,
        chargers,
      }
    } catch (err) {
      throw toChargerStorageError(err, `Failed to read query snapshot for key: ${queryKey}`)
    }
  }

  /**
   * Atomically writes query snapshot metadata, station info, and charger statuses.
   * On failure, rolls back changes preserving prior observedAt and snapshot state.
   */
  public async writeQuerySnapshot(input: WriteQuerySnapshotInput): Promise<void> {
    if (!input.queryKey || !input.source || !input.observedAt) {
      throw new ChargerStorageError(
        'CHARGER_STORAGE_INVALID_DATA',
        'writeQuerySnapshot requires queryKey, source, and observedAt',
      )
    }

    const nowIso = new Date().toISOString()
    const stations = input.stations ?? []
    const chargers = input.chargers ?? []
    const itemCount = chargers.length
    const metaJson = input.metadata ? JSON.stringify(input.metadata) : null

    this.runTransaction(() => {
      for (const ch of chargers) {
        if (!ch.source || !ch.stationId || !ch.chargerId) {
          throw new ChargerStorageError(
            'CHARGER_STORAGE_INVALID_DATA',
            'writeQuerySnapshot charger items require source, stationId, and chargerId',
          )
        }
        const chKey = buildChargerKey(ch.source, ch.operatorId, ch.stationId, ch.chargerId)
        const observedAt = ch.observedAt ?? input.observedAt
        if (!this.shouldAcceptChargerUpdate(chKey, ch.statusUpdatedAt, observedAt)) {
          return
        }
      }

      // 1. Upsert stations
      for (const st of stations) {
        if (!st.source || !st.stationId) {
          throw new ChargerStorageError(
            'CHARGER_STORAGE_INVALID_DATA',
            'writeQuerySnapshot station items require source and stationId',
          )
        }
        const stKey = buildStationKey(st.source, st.operatorId, st.stationId)
        const lat = st.location?.lat ?? null
        const lng = st.location?.lng ?? null
        const stMeta = st.metadata ? JSON.stringify(st.metadata) : null
        this.stmtUpsertStation.run(
          stKey,
          st.source,
          st.operatorId ?? null,
          st.stationId,
          st.name ?? null,
          st.address ?? null,
          lat,
          lng,
          st.access ?? 'UNKNOWN',
          st.sourceObservedAt ?? input.observedAt,
          st.sourceVersion ?? null,
          stMeta,
          nowIso,
        )
      }

      // 2. Upsert chargers
      for (const ch of chargers) {
        const chKey = buildChargerKey(ch.source, ch.operatorId, ch.stationId, ch.chargerId)
        const stKey = buildStationKey(ch.source, ch.operatorId, ch.stationId)
        const observedAt = ch.observedAt ?? input.observedAt
        this.stmtUpsertCharger.run(
          chKey,
          stKey,
          ch.source,
          ch.operatorId ?? null,
          ch.stationId,
          ch.chargerId,
          ch.rawStatus ?? null,
          ch.normalizedStatus ?? null,
          ch.status ?? 'UNKNOWN',
          ch.statusUpdatedAt ?? null,
          observedAt,
          ch.freshness ?? 'UNKNOWN',
          ch.sourceVersion ?? null,
          nowIso,
        )
      }

      // 3. Upsert query cache metadata
      this.stmtUpsertQueryCache.run(input.queryKey, input.source, itemCount, input.observedAt, metaJson, nowIso, nowIso)

      // 4. Update junction table for queryKey
      this.stmtDeleteQueryCacheItems.run(input.queryKey)

      for (const ch of chargers) {
        const chKey = buildChargerKey(ch.source, ch.operatorId, ch.stationId, ch.chargerId)
        const stKey = buildStationKey(ch.source, ch.operatorId, ch.stationId)
        this.stmtInsertQueryCacheItem.run(input.queryKey, chKey, stKey)
      }

      // If stations were supplied without individual chargers, associate station keys
      if (chargers.length === 0) {
        for (const st of stations) {
          const stKey = buildStationKey(st.source, st.operatorId, st.stationId)
          this.stmtInsertQueryCacheItem.run(input.queryKey, `dummy:${stKey}`, stKey)
        }
      }
    })
  }

  /**
   * Independently upserts one or more station catalog records idempotently.
   */
  public async upsertStationInfo(stations: StationInfoInput | StationInfoInput[]): Promise<void> {
    const list = Array.isArray(stations) ? stations : [stations]
    if (list.length === 0) return

    const nowIso = new Date().toISOString()

    this.runTransaction(() => {
      for (const st of list) {
        if (!st.source || !st.stationId) {
          throw new ChargerStorageError(
            'CHARGER_STORAGE_INVALID_DATA',
            'upsertStationInfo requires source and stationId',
          )
        }

        const stKey = buildStationKey(st.source, st.operatorId, st.stationId)
        const lat = st.location?.lat ?? null
        const lng = st.location?.lng ?? null
        const stMeta = st.metadata ? JSON.stringify(st.metadata) : null

        this.stmtUpsertStation.run(
          stKey,
          st.source,
          st.operatorId ?? null,
          st.stationId,
          st.name ?? null,
          st.address ?? null,
          lat,
          lng,
          st.access ?? 'UNKNOWN',
          st.sourceObservedAt ?? nowIso,
          st.sourceVersion ?? null,
          stMeta,
          nowIso,
        )
      }
    })
  }

  /**
   * Independently upserts one or more charger dynamic status records idempotently.
   */
  public async upsertChargerStatus(statuses: ChargerStatusInput | ChargerStatusInput[]): Promise<void> {
    const list = Array.isArray(statuses) ? statuses : [statuses]
    if (list.length === 0) return

    const nowIso = new Date().toISOString()

    this.runTransaction(() => {
      for (const ch of list) {
        if (!ch.source || !ch.stationId || !ch.chargerId) {
          throw new ChargerStorageError(
            'CHARGER_STORAGE_INVALID_DATA',
            'upsertChargerStatus requires source, stationId, and chargerId',
          )
        }

        const chKey = buildChargerKey(ch.source, ch.operatorId, ch.stationId, ch.chargerId)
        const stKey = buildStationKey(ch.source, ch.operatorId, ch.stationId)
        const observedAt = ch.observedAt ?? nowIso
        if (!this.shouldAcceptChargerUpdate(chKey, ch.statusUpdatedAt, observedAt)) continue

        this.stmtUpsertCharger.run(
          chKey,
          stKey,
          ch.source,
          ch.operatorId ?? null,
          ch.stationId,
          ch.chargerId,
          ch.rawStatus ?? null,
          ch.normalizedStatus ?? null,
          ch.status ?? 'UNKNOWN',
          ch.statusUpdatedAt ?? null,
          observedAt,
          ch.freshness ?? 'UNKNOWN',
          ch.sourceVersion ?? null,
          nowIso,
        )
      }
    })
  }

  /**
   * Finds a station record by stationId (or opaque key), resolving its associated chargers.
   */
  public async findStation(
    stationId: string,
    options?: { source?: ChargerSource; operatorId?: string | null },
  ): Promise<ChargerStationRecord | null> {
    if (this.isClosed) {
      throw new ChargerStorageError('CHARGER_STORAGE_CLOSED', 'SQLite snapshot store is closed')
    }

    try {
      let stationRow: Record<string, unknown> | undefined

      if (options?.source) {
        const stKey = buildStationKey(options.source, options.operatorId, stationId)
        stationRow = this.stmtGetStationByKey.get(stKey)
      } else if (stationId.includes(':')) {
        stationRow = this.stmtGetStationByKey.get(stationId)
      } else {
        stationRow = this.stmtGetStationById.get(stationId)
      }

      if (!stationRow) {
        return null
      }

      const stKey = String(stationRow.station_key)
      const rawChargers = this.stmtGetChargersByStationKey.all(stKey) as Array<Record<string, unknown>>

      const chargers: ChargerStatusRecord[] = rawChargers.map((r) => ({
        source: String(r.source) as ChargerSource,
        operatorId: r.operator_id !== null && r.operator_id !== undefined ? String(r.operator_id) : null,
        stationId: String(r.station_id),
        chargerId: String(r.charger_id),
        rawStatus: r.raw_status !== null && r.raw_status !== undefined ? String(r.raw_status) : null,
        normalizedStatus: (r.normalized_status as MappedChargerStatus) ?? null,
        status: (r.status as EffectiveChargerStatus) ?? 'UNKNOWN',
        statusUpdatedAt:
          r.status_updated_at !== null && r.status_updated_at !== undefined ? String(r.status_updated_at) : null,
        observedAt: String(r.observed_at),
        freshness: (r.freshness as Freshness) ?? 'UNKNOWN',
        sourceVersion: r.source_version !== null && r.source_version !== undefined ? String(r.source_version) : null,
      }))

      return {
        source: String(stationRow.source) as ChargerSource,
        operatorId:
          stationRow.operator_id !== null && stationRow.operator_id !== undefined
            ? String(stationRow.operator_id)
            : null,
        stationId: String(stationRow.station_id),
        name: stationRow.name !== null && stationRow.name !== undefined ? String(stationRow.name) : null,
        address: stationRow.address !== null && stationRow.address !== undefined ? String(stationRow.address) : null,
        location:
          stationRow.lat !== null &&
          stationRow.lat !== undefined &&
          stationRow.lng !== null &&
          stationRow.lng !== undefined
            ? { lat: Number(stationRow.lat), lng: Number(stationRow.lng) }
            : null,
        access: (stationRow.access as 'PUBLIC' | 'RESTRICTED' | 'UNKNOWN') ?? 'UNKNOWN',
        chargers,
        sourceObservedAt: String(stationRow.source_observed_at),
        sourceVersion:
          stationRow.source_version !== null && stationRow.source_version !== undefined
            ? String(stationRow.source_version)
            : null,
      }
    } catch (err) {
      throw toChargerStorageError(err, `Failed to find station: ${stationId}`)
    }
  }

  /**
   * Finds charger status records matching the filter.
   */
  public async findChargers(filter: FindChargersFilter): Promise<ChargerStatusRecord[]> {
    if (this.isClosed) {
      throw new ChargerStorageError('CHARGER_STORAGE_CLOSED', 'SQLite snapshot store is closed')
    }

    try {
      const source = filter.source ?? null
      const operatorId = filter.operatorId ?? null
      const stationId = filter.stationId ?? null

      const rawChargers = this.stmtGetChargersFiltered.all(
        source,
        source,
        operatorId,
        operatorId,
        stationId,
        stationId,
      ) as Array<Record<string, unknown>>

      return rawChargers.map((r) => ({
        source: String(r.source) as ChargerSource,
        operatorId: r.operator_id !== null && r.operator_id !== undefined ? String(r.operator_id) : null,
        stationId: String(r.station_id),
        chargerId: String(r.charger_id),
        rawStatus: r.raw_status !== null && r.raw_status !== undefined ? String(r.raw_status) : null,
        normalizedStatus: (r.normalized_status as MappedChargerStatus) ?? null,
        status: (r.status as EffectiveChargerStatus) ?? 'UNKNOWN',
        statusUpdatedAt:
          r.status_updated_at !== null && r.status_updated_at !== undefined ? String(r.status_updated_at) : null,
        observedAt: String(r.observed_at),
        freshness: (r.freshness as Freshness) ?? 'UNKNOWN',
        sourceVersion: r.source_version !== null && r.source_version !== undefined ? String(r.source_version) : null,
      }))
    } catch (err) {
      throw toChargerStorageError(err, 'Failed to find chargers with filter')
    }
  }

  /**
   * Retrieves query cache metadata without loading full station/charger items.
   */
  public async getQueryCacheMetadata(queryKey: string): Promise<QueryCacheMetadata | null> {
    if (this.isClosed) {
      throw new ChargerStorageError('CHARGER_STORAGE_CLOSED', 'SQLite snapshot store is closed')
    }

    try {
      const row = this.stmtGetQueryCache.get(queryKey) as
        | {
            query_key: string
            source: string
            item_count: number | bigint
            observed_at: string
            metadata_json: string | null
            created_at: string
            updated_at: string
          }
        | undefined

      if (!row) return null

      return {
        queryKey: row.query_key,
        source: row.source as ChargerSource,
        itemCount: Number(row.item_count),
        observedAt: row.observed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: row.metadata_json
          ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
          : null,
      }
    } catch (err) {
      throw toChargerStorageError(err, `Failed to get query cache metadata for key: ${queryKey}`)
    }
  }

  /**
   * Closes the SQLite database connection.
   */
  public close(): void {
    if (this.isClosed) return
    this.isClosed = true
    try {
      this.db.close()
    } catch (err) {
      throw toChargerStorageError(err, 'Failed to close SQLite snapshot store')
    }
  }

  public onModuleDestroy(): void {
    this.close()
  }
}

function parseStorageTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})?$/)
  if (compact) {
    const [, year, month, day, hour, minute, second, milliseconds] = compact
    const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds ?? '000'}+09:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
