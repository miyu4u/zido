import type { DatabaseSync } from 'node:sqlite'

/**
 * ============================================================================
 * SINGLE-NODE ARCHITECTURE & CONCURRENCY NOTICE
 * ============================================================================
 * This schema and store are architected for a single-node embedded SQLite database
 * supporting local cache-aside snapshot storage for EV charging stations and chargers.
 *
 * Concurrency Model:
 * 1. Single-node local file: WAL (Write-Ahead Logging) enables concurrent readers
 *    alongside a single active writer.
 * 2. SQLite transactions (BEGIN IMMEDIATE / COMMIT / ROLLBACK) ensure atomic writes
 *    and prevent dirty reads.
 * 3. Lock contention between concurrent writers or threads is handled via SQLite
 *    busy timeout and typed CHARGER_STORAGE_LOCKED classification.
 *
 * Limitation:
 * Multi-process writes over shared network filesystems (NFS, SMB, CIFS) are not supported.
 * For distributed multi-instance clustering, introduce an external database or dedicated
 * worker architecture.
 * ============================================================================
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS station_info (
  station_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  operator_id TEXT,
  station_id TEXT NOT NULL,
  name TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  access TEXT NOT NULL DEFAULT 'UNKNOWN',
  source_observed_at TEXT NOT NULL,
  source_version TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_station_info_lookup
  ON station_info (source, operator_id, station_id);

CREATE INDEX IF NOT EXISTS idx_station_info_station_id
  ON station_info (station_id);

CREATE TABLE IF NOT EXISTS charger_status (
  charger_key TEXT PRIMARY KEY,
  station_key TEXT NOT NULL,
  source TEXT NOT NULL,
  operator_id TEXT,
  station_id TEXT NOT NULL,
  charger_id TEXT NOT NULL,
  raw_status TEXT,
  normalized_status TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  status_updated_at TEXT,
  observed_at TEXT NOT NULL,
  freshness TEXT NOT NULL DEFAULT 'UNKNOWN',
  source_version TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_charger_status_station_key
  ON charger_status (station_key);

CREATE INDEX IF NOT EXISTS idx_charger_status_lookup
  ON charger_status (source, operator_id, station_id);

CREATE INDEX IF NOT EXISTS idx_charger_status_station_id
  ON charger_status (station_id);

CREATE INDEX IF NOT EXISTS idx_charger_status_observed_at
  ON charger_status (observed_at);

CREATE TABLE IF NOT EXISTS query_cache (
  query_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  observed_at TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS query_cache_items (
  query_key TEXT NOT NULL,
  charger_key TEXT NOT NULL,
  station_key TEXT NOT NULL,
  PRIMARY KEY (query_key, charger_key),
  FOREIGN KEY (query_key) REFERENCES query_cache(query_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_query_cache_items_station
  ON query_cache_items (query_key, station_key);
`

/**
 * Initializes schema and required indexes in the SQLite database.
 */
export function initSchema(db: DatabaseSync): void {
  db.exec(SCHEMA_SQL)
}

/**
 * Builds canonical composite station key.
 * Pattern: `${source}:${operatorId ?? ''}:${stationId}`
 */
export function buildStationKey(source: string, operatorId: string | null | undefined, stationId: string): string {
  return `${source}:${operatorId ?? ''}:${stationId}`
}

/**
 * Builds canonical composite charger key.
 * Pattern: `${source}:${operatorId ?? ''}:${stationId}:${chargerId}`
 */
export function buildChargerKey(
  source: string,
  operatorId: string | null | undefined,
  stationId: string,
  chargerId: string,
): string {
  return `${source}:${operatorId ?? ''}:${stationId}:${chargerId}`
}
