import { Injectable, Logger } from '@nestjs/common'
import { config, McpException } from 'zido/common'
import type { ChargerSnapshotStore, QuerySnapshotBundle } from 'zido/charger-storage'
import type { ChargerStationRecord, ChargerStatusRecord, ChargerSource, Freshness } from './contracts'
import {
  evaluateFreshness,
  makeOpaqueStationId,
  parseOpaqueStationId,
  parseUpstreamTimestamp,
  toEffectiveStatus,
} from './freshness'
import { RefreshCoordinator, RefreshOptions } from './refresh-coordinator'
import {
  CollectionScopeInputSchema,
  DeterministicLocalBoundaryResolver,
  type CollectionScopeInput,
  type CollectionScopeMetadata,
  type RegionScopeResolver,
} from './collection-scope'

export interface GetSnapshotOptions {
  /** Cache TTL in milliseconds. */
  ttlMs: number
  /** Optional KECO zcode (2-digit province code). */
  zcode?: string
  /** 정규화된 KECO 시·도 code 집합이다. */
  regionCodes?: string[]
  /** 이중 gate를 통과한 명시적 전국 수집 여부다. */
  nationwide?: true
  /** Public direct call에서도 요구되는 명시적 전국 수집 승인이다. */
  acknowledgeNationwide?: true
  /** Optional KECO status update window in minutes. */
  periodMinutes?: number
  /** Provider source — currently only 'keco' is supported. */
  source?: 'keco'
  /** Override max retries forwarded to RefreshCoordinator (default 2). */
  maxRetries?: number
  /** Provider refresh timeout in milliseconds. */
  refreshTimeoutMs?: number
  /** Snapshot에 함께 기록할 collection scope와 boundary provenance다. */
  scopeMetadata?: CollectionScopeMetadata
}

export type ChargerStatusFilter = 'AVAILABLE' | 'CHARGING' | 'UNAVAILABLE' | 'MAINTENANCE' | 'UNKNOWN'

export interface ChargerSearchQuery {
  lat: number
  lng: number
  radiusM?: number
  status?: ChargerStatusFilter
  freshness?: Freshness | 'ANY'
  source?: ChargerSource
  limit?: number
  cursor?: string
  now?: string
  /** 좌표 검색과 분리된 collection scope 의도다. */
  scope?: CollectionScopeInput
}

export interface ChargingStationResult extends ChargerStationRecord {
  stationId: string
  distanceM?: number
}

export interface ChargingApiSourceSummary {
  source: ChargerSource
  lastSuccessfulObservedAt: string | null
  freshness: Freshness
  itemCount: number
}

export interface ChargingSearchResult {
  items: ChargingStationResult[]
  nextCursor: string | null
  matchedCount: number
  dataAsOf: string | null
  sourceSummary: ChargingApiSourceSummary[]
  /** 실제 판정·수집에 사용한 범위와 coverage 근거다. */
  scope: CollectionScopeMetadata
}

/**
 * Domain service for EV-charger snapshot retrieval.
 *
 * Read path (cache-aside):
 *   1. Read store — FRESH snapshot → return immediately (zero provider calls).
 *   2. Null or stale  → trigger single-flight refresh via RefreshCoordinator,
 *      then re-read the store.
 *   3. If refresh fails and a stale snapshot exists → return it (stale
 *      fallback).
 *   4. If refresh fails and no snapshot has ever been written → throw
 *      McpException SNAPSHOT_UNAVAILABLE (503).
 *
 * Station detail:
 *   Parses the opaque stationId, reads from store.  NOT_FOUND → 404.
 */
@Injectable()
export class ChargerService {
  private readonly logger = new Logger(ChargerService.name)

  constructor(
    private readonly store: ChargerSnapshotStore,
    private readonly coordinator: RefreshCoordinator,
    private readonly scopeResolver: RegionScopeResolver = new DeterministicLocalBoundaryResolver(),
    private readonly allowNationwideCollection: boolean = config.charger.allowNationwideCollection,
  ) {}

  /**
   * Returns the snapshot for the given queryKey, refreshing from the provider
   * when the cached copy is absent or stale.
   */
  async getSnapshot(queryKey: string, options: GetSnapshotOptions): Promise<QuerySnapshotBundle> {
    const {
      ttlMs,
      zcode,
      regionCodes,
      nationwide,
      acknowledgeNationwide,
      periodMinutes,
      source = 'keco',
      maxRetries,
      refreshTimeoutMs,
      scopeMetadata,
    } = options
    if (nationwide === true && (!this.allowNationwideCollection || acknowledgeNationwide !== true)) {
      throw new McpException('Nationwide collection is not allowed', 'NATIONWIDE_NOT_ALLOWED', 403)
    }

    // --- 1. Try cache ---
    const cached = await this.store.readQuerySnapshot(queryKey, { ttlMs })
    if (cached !== null && !cached.isStale) {
      return this.recalculateFreshness(cached, ttlMs)
    }

    // --- 2. Refresh (single-flight) ---
    const refreshOpts: RefreshOptions = {
      queryKey,
      source,
      zcode,
      regionCodes,
      nationwide,
      metadata: scopeMetadata,
      periodMinutes,
      ttlMs,
      maxRetries,
      timeoutMs: refreshTimeoutMs,
    }
    let refreshErr: unknown

    try {
      await this.coordinator.refresh(refreshOpts)
    } catch (err: unknown) {
      refreshErr = err
      this.logger.warn(
        `[ChargerService] refresh failed for queryKey=${queryKey}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // --- 3. Re-read (may be fresh after success, or stale after failure) ---
    const snapshot = await this.store.readQuerySnapshot(queryKey, { ttlMs })
    if (snapshot !== null) {
      // A failed refresh must never make a stale fallback appear fresh,
      // even when a custom store omitted TTL evaluation on the re-read.
      const fallback = refreshErr && !snapshot.isStale ? { ...snapshot, isStale: true } : snapshot
      return this.recalculateFreshness(fallback, ttlMs)
    }

    // --- 4. Cold failure — no snapshot has ever been written ---
    throw this.toPublicRefreshException(refreshErr)
  }

  /**
   * Returns full station detail (metadata + charger statuses) by opaque
   * stationId as returned from list endpoints.
   *
   * Throws McpException NOT_FOUND (404) when the station does not exist in the
   * local snapshot store.
   */
  async getStation(opaqueId: string): Promise<ChargerStationRecord> {
    let parsed: ReturnType<typeof parseOpaqueStationId>
    try {
      parsed = parseOpaqueStationId(opaqueId)
    } catch {
      throw new McpException('Invalid stationId', 'INVALID_ARGUMENT', 400)
    }
    if (!opaqueId || opaqueId.split(':').length < 3 || !parsed.stationId || !parsed.source) {
      throw new McpException('Invalid stationId', 'INVALID_ARGUMENT', 400)
    }
    const { source, operatorId, stationId } = parsed
    const station = await this.store.findStation(stationId, { source, operatorId })
    if (station === null) {
      throw new McpException(`Station not found: ${opaqueId}`, 'NOT_FOUND', 404)
    }
    return this.recalculateStationFreshness(station, config.charger?.ttlMs ?? 300_000)
  }

  /**
   * Runs the location query against the same cache-aside snapshot path used by
   * all transports.  The provider is never called directly by this method.
   */
  async searchNearby(query: ChargerSearchQuery): Promise<ChargingSearchResult> {
    if (!Number.isFinite(query.lat) || query.lat < -90 || query.lat > 90) {
      throw new McpException('Invalid latitude', 'INVALID_ARGUMENT', 400)
    }
    if (!Number.isFinite(query.lng) || query.lng < -180 || query.lng > 180) {
      throw new McpException('Invalid longitude', 'INVALID_ARGUMENT', 400)
    }
    const radiusM = query.radiusM ?? 3_000
    const limit = query.limit ?? 20
    if (!Number.isInteger(radiusM) || radiusM <= 0 || radiusM > 50_000) {
      throw new McpException('Invalid radiusM', 'INVALID_ARGUMENT', 400)
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new McpException('Invalid limit', 'INVALID_ARGUMENT', 400)
    }
    const source = query.source ?? 'keco'
    if (source !== 'keco') throw new McpException('Unsupported source', 'INVALID_ARGUMENT', 400)
    const periodMinutes = config.charger?.periodMinutes ?? 5
    const ttlMs = config.charger?.ttlMs ?? 300_000
    const scope = await this.resolveCollectionScope(query, radiusM)
    const scopeIdentity =
      scope.mode === 'NATIONWIDE' ? 'nationwide' : scope.regionCodes.slice().sort().join(',')
    const queryKey = JSON.stringify({
      source,
      scope: scopeIdentity,
      periodMinutes,
      boundaryVersion: scope.provenance.version,
      boundarySource: scope.provenance.source,
      boundaryEffectiveDate: scope.provenance.effectiveDate,
    })
    const cached = await this.store.readQuerySnapshot(queryKey, { ttlMs })
    const collectionTriggered = cached === null || cached.isStale
    const snapshot =
      cached !== null && !cached.isStale
        ? this.recalculateFreshness(cached, ttlMs)
        : await this.getSnapshot(queryKey, {
            ttlMs,
            maxRetries: config.charger?.maxRetries ?? 1,
            refreshTimeoutMs: config.charger?.timeoutMs ?? 8_000,
            source: 'keco',
            regionCodes: scope.mode === 'NATIONWIDE' ? undefined : scope.regionCodes,
            nationwide: scope.mode === 'NATIONWIDE' ? true : undefined,
            acknowledgeNationwide: scope.mode === 'NATIONWIDE' ? true : undefined,
            periodMinutes,
            scopeMetadata: scope,
          })
    const items = snapshot.stations
      .map((station) => {
        const distanceM = station.location
          ? haversineMeters(query.lat, query.lng, station.location.lat, station.location.lng)
          : undefined
        return {
          ...station,
          stationId: makeOpaqueStationId(station.source, station.operatorId, station.stationId),
          distanceM,
          chargers: station.chargers.map((charger) => this.recalculateStatus(charger, snapshot.isStale, ttlMs)),
        }
      })
      .filter((station) => station.distanceM !== undefined && station.distanceM <= radiusM)
      .filter((station) =>
        station.chargers.some(
          (charger) =>
            (!query.status || charger.status === query.status) &&
            (!query.freshness || query.freshness === 'ANY' || charger.freshness === query.freshness),
        ),
      )
      .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))

    let offset = 0
    if (query.cursor) {
      try {
        offset = decodeCursor(query.cursor)
      } catch {
        throw new McpException('Invalid cursor', 'INVALID_CURSOR', 400)
      }
    }
    if (query.cursor && offset > items.length) {
      throw new McpException('Invalid cursor', 'INVALID_CURSOR', 400)
    }
    return {
      items: items.slice(offset, offset + limit),
      nextCursor: offset + limit < items.length ? encodeCursor(offset + limit) : null,
      matchedCount: items.length,
      dataAsOf: snapshot.observedAt || null,
      sourceSummary: [
        {
          source: snapshot.source,
          lastSuccessfulObservedAt: snapshot.observedAt || null,
          freshness: this.summaryFreshness(items.flatMap((station) => station.chargers)),
          itemCount: snapshot.itemCount,
        },
      ],
      scope: { ...scope, collectionTriggered },
    }
  }

  /**
   * Provider를 호출하지 않고 요청의 collection scope와 예상 region 수를 판정한다.
   */
  async previewScope(query: Pick<ChargerSearchQuery, 'lat' | 'lng' | 'radiusM' | 'scope'>): Promise<CollectionScopeMetadata> {
    const radiusM = query.radiusM ?? 3_000
    if (
      !Number.isFinite(query.lat) ||
      query.lat < -90 ||
      query.lat > 90 ||
      !Number.isFinite(query.lng) ||
      query.lng < -180 ||
      query.lng > 180 ||
      !Number.isInteger(radiusM) ||
      radiusM <= 0 ||
      radiusM > 50_000
    ) {
      throw new McpException('Invalid scope preview input', 'INVALID_ARGUMENT', 400)
    }
    return this.resolveCollectionScope(query, radiusM)
  }

  async getStatus(stationId: string, chargerId?: string): Promise<ChargerStationRecord> {
    const station = await this.getStation(stationId)
    if (!chargerId) return station
    const charger = station.chargers.find((item) => item.chargerId === chargerId)
    if (!charger) throw new McpException('Charger not found', 'NOT_FOUND', 404)
    return { ...station, chargers: [charger] }
  }

  private recalculateFreshness(snapshot: QuerySnapshotBundle, ttlMs: number): QuerySnapshotBundle {
    if (snapshot.chargers.length === 0) return snapshot
    const stations = snapshot.stations.map((station) => ({
      ...station,
      chargers: station.chargers.map((charger) => this.recalculateStatus(charger, snapshot.isStale, ttlMs)),
    }))
    return { ...snapshot, stations, chargers: stations.flatMap((station) => station.chargers) }
  }

  private recalculateStationFreshness(station: ChargerStationRecord, ttlMs: number): ChargerStationRecord {
    if (station.chargers.length === 0) return station
    const snapshotObservedAt = parseUpstreamTimestamp(station.sourceObservedAt)
    const snapshotIsStale = snapshotObservedAt === null || Date.now() - snapshotObservedAt.getTime() > ttlMs
    return {
      ...station,
      chargers: station.chargers.map((charger) => this.recalculateStatus(charger, snapshotIsStale, ttlMs)),
    }
  }

  private recalculateStatus(charger: ChargerStatusRecord, forceStale = false, ttlMs = 300_000): ChargerStatusRecord {
    const freshness = forceStale
      ? 'STALE'
      : evaluateFreshness({
          statusUpdatedAt: charger.statusUpdatedAt,
          now: new Date(),
          ttlMs,
        })
    return { ...charger, freshness, status: toEffectiveStatus(charger.normalizedStatus, freshness) }
  }

  private summaryFreshness(chargers: ChargerStatusRecord[]): Freshness {
    if (chargers.some((charger) => charger.freshness === 'FRESH')) return 'FRESH'
    if (chargers.some((charger) => charger.freshness === 'STALE')) return 'STALE'
    return 'UNKNOWN'
  }

  /**
   * 모든 transport가 공유하는 fail-closed 범위 판정과 nationwide gate를 적용한다.
   */
  private async resolveCollectionScope(
    query: Pick<ChargerSearchQuery, 'lat' | 'lng' | 'scope'>,
    radiusM: number,
  ): Promise<CollectionScopeMetadata> {
    const parsedIntent = CollectionScopeInputSchema.safeParse(query.scope ?? { mode: 'AUTO' })
    if (!parsedIntent.success) {
      throw new McpException(
        parsedIntent.error.issues[0]?.message ?? 'Invalid collection scope',
        'INVALID_ARGUMENT',
        400,
      )
    }
    const intent = parsedIntent.data
    let autoResult
    try {
      autoResult = await this.scopeResolver.resolveScope({ lat: query.lat, lng: query.lng, radiusM })
    } catch {
      autoResult = {
        coverage: 'UNRESOLVED' as const,
        regionCodes: [],
        provenance: {
          version: 'unresolved',
          source: 'boundary-resolution-failed',
          effectiveDate: 'unknown',
        },
        unresolvedReason: 'BOUNDARY_RESOLUTION_FAILED',
      }
    }

    if (intent.mode === 'NATIONWIDE') {
      if (!this.allowNationwideCollection || intent.acknowledgeNationwide !== true) {
        throw new McpException('Nationwide collection is not allowed', 'NATIONWIDE_NOT_ALLOWED', 403)
      }
      return {
        mode: 'NATIONWIDE',
        coverage: 'COMPLETE',
        regionCodes: [],
        scopeSource: 'NATIONWIDE',
        collectionTriggered: false,
        provenance: autoResult.provenance,
      }
    }

    if (intent.mode === 'REGIONS') {
      const regionCodes = Array.from(new Set(intent.regionCodes)).sort()
      const complete =
        autoResult.coverage === 'COMPLETE' &&
        autoResult.regionCodes.every((regionCode) => regionCodes.includes(regionCode))
      return {
        mode: 'REGIONS',
        coverage: complete ? 'COMPLETE' : 'PARTIAL',
        regionCodes,
        scopeSource: 'REGIONS',
        collectionTriggered: false,
        provenance: autoResult.provenance,
        candidateRegions: autoResult.regionCodes,
        unresolvedReason: autoResult.unresolvedReason,
      }
    }

    if (autoResult.coverage !== 'COMPLETE' || autoResult.regionCodes.length === 0) {
      const error = new McpException('Collection scope is required', 'COLLECTION_SCOPE_REQUIRED', 409)
      Object.assign(error, {
        scope: {
          mode: 'AUTO',
          coverage: 'UNRESOLVED',
          regionCodes: [],
          scopeSource: 'AUTO',
          collectionTriggered: false,
          provenance: autoResult.provenance,
          candidateRegions: Array.from(
            new Set([...(autoResult.candidateRegions ?? []), ...config.charger.defaultRegionCodes]),
          ).sort(),
          unresolvedReason: autoResult.unresolvedReason,
        } satisfies CollectionScopeMetadata,
      })
      throw error
    }

    return {
      mode: 'AUTO',
      coverage: 'COMPLETE',
      regionCodes: autoResult.regionCodes.slice().sort(),
      scopeSource: 'AUTO',
      collectionTriggered: false,
      provenance: autoResult.provenance,
    }
  }

  /**
   * Provider details stay inside logs/telemetry.  The public domain contract
   * exposes only stable, actionable error codes.
   */
  private toPublicRefreshException(error: unknown): McpException {
    const failureKind =
      typeof error === 'object' && error !== null && 'failureKind' in error
        ? String((error as { failureKind?: unknown }).failureKind)
        : undefined

    if (failureKind === 'RATE_LIMITED') {
      return new McpException('Charging provider rate limit reached', 'RATE_LIMITED', 429)
    }

    return new McpException('Charging snapshot is temporarily unavailable', 'SNAPSHOT_UNAVAILABLE', 503)
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): number {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown }
  if (!Number.isInteger(parsed.offset) || Number(parsed.offset) < 0) throw new Error('invalid cursor')
  return Number(parsed.offset)
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 6_371_000
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = radians(lat2 - lat1)
  const dLng = radians(lng2 - lng1)
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(value))
}
