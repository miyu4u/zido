import type {
  ChargerSource,
  Freshness,
  MappedChargerStatus,
  EffectiveChargerStatus,
  ChargerStatusRecord,
  ChargerStationRecord,
} from 'zido/charger-domain'

/**
 * Input representation for station static / catalog metadata.
 */
export interface StationInfoInput {
  source: ChargerSource
  operatorId: string | null
  stationId: string
  name?: string | null
  address?: string | null
  location?: { lat: number; lng: number } | null
  access?: 'PUBLIC' | 'RESTRICTED' | 'UNKNOWN'
  sourceObservedAt?: string
  sourceVersion?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Persisted station record in the storage engine.
 */
export interface StationInfoRecord {
  stationKey: string
  source: ChargerSource
  operatorId: string | null
  stationId: string
  name: string | null
  address: string | null
  location: { lat: number; lng: number } | null
  access: 'PUBLIC' | 'RESTRICTED' | 'UNKNOWN'
  sourceObservedAt: string
  sourceVersion: string | null
  metadata: Record<string, unknown> | null
  updatedAt: string
}

/**
 * Input representation for charger dynamic status updates.
 */
export interface ChargerStatusInput {
  source: ChargerSource
  operatorId: string | null
  stationId: string
  chargerId: string
  rawStatus?: string | null
  normalizedStatus?: MappedChargerStatus
  status?: EffectiveChargerStatus
  statusUpdatedAt?: string | null
  observedAt: string
  freshness?: Freshness
  sourceVersion?: string | null
}

/**
 * Query cache entry metadata.
 */
export interface QueryCacheMetadata {
  queryKey: string
  source: ChargerSource
  itemCount: number
  observedAt: string
  createdAt: string
  updatedAt: string
}

/**
 * Full snapshot returned by query cache read.
 */
export interface QuerySnapshotBundle {
  queryKey: string
  source: ChargerSource
  observedAt: string
  isStale: boolean
  itemCount: number
  stations: ChargerStationRecord[]
  chargers: ChargerStatusRecord[]
}

/**
 * Input for atomic query snapshot write.
 */
export interface WriteQuerySnapshotInput {
  queryKey: string
  source: ChargerSource
  observedAt: string
  stations?: StationInfoInput[]
  chargers?: ChargerStatusInput[]
  metadata?: Record<string, unknown> | null
}

/**
 * Options for configuring SQLite snapshot store instance.
 */
export interface SqliteStoreOptions {
  /**
   * Path to SQLite database file, or ':memory:' for transient in-memory database.
   */
  dbPath?: string
  /**
   * SQLite busy timeout in milliseconds (defaults to 5000ms).
   */
  busyTimeoutMs?: number
  /**
   * Enable WAL (Write-Ahead Logging) journal mode for file-backed storage (defaults to true).
   */
  walMode?: boolean
}

/**
 * Filter options for finding chargers.
 */
export interface FindChargersFilter {
  source?: ChargerSource
  operatorId?: string | null
  stationId?: string
}

/**
 * Abstract store contract for EV charging snapshot storage and query cache.
 *
 * NOTE on Single-Node Architecture Limitation:
 * This store is designed as a local single-node cache-aside persistence layer
 * backed by SQLite. It is NOT designed for multi-replica distributed write concurrency
 * over shared network filesystems (NFS/CIFS). For distributed multi-node clustering,
 * a separate replicated database or worker architecture is required.
 */
export abstract class ChargerSnapshotStore {
  /**
   * Reads a cached query snapshot by opaque queryKey.
   * Returns null if cache entry does not exist or was never written.
   * If snapshot exists, evaluates staleness when ttlMs is provided.
   */
  abstract readQuerySnapshot(
    queryKey: string,
    options?: { ttlMs?: number; now?: string | Date }
  ): Promise<QuerySnapshotBundle | null>

  /**
   * Atomically writes query snapshot metadata, station records, and charger statuses.
   * Preserves previous observedAt and state on failure via SQLite transaction rollback.
   */
  abstract writeQuerySnapshot(input: WriteQuerySnapshotInput): Promise<void>

  /**
   * Independently upserts one or more station catalog records idempotently.
   */
  abstract upsertStationInfo(stations: StationInfoInput | StationInfoInput[]): Promise<void>

  /**
   * Independently upserts one or more charger dynamic status records idempotently.
   */
  abstract upsertChargerStatus(statuses: ChargerStatusInput | ChargerStatusInput[]): Promise<void>

  /**
   * Finds a station record by stationId (or opaque key), resolving associated chargers.
   */
  abstract findStation(
    stationId: string,
    options?: { source?: ChargerSource; operatorId?: string | null }
  ): Promise<ChargerStationRecord | null>

  /**
   * Finds charger status records matching the filter.
   */
  abstract findChargers(filter: FindChargersFilter): Promise<ChargerStatusRecord[]>

  /**
   * Retrieves query cache entry metadata without loading full item bundles.
   */
  abstract getQueryCacheMetadata(queryKey: string): Promise<QueryCacheMetadata | null>

  /**
   * Closes underlying SQLite database connection and releases resources.
   */
  abstract close(): Promise<void> | void
}
