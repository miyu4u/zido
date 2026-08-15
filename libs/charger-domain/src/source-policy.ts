import { ChargerStationRecord, ChargerStatusRecord, ChargerSource } from './contracts'

/**
 * Source metadata and priority configuration.
 */
export interface SourceConfig {
  source: ChargerSource
  priority: number // Higher number = higher priority
  defaultTtlMs: number
}

export const DEFAULT_SOURCE_CONFIGS: Record<string, SourceConfig> = {
  keco: {
    source: 'keco',
    priority: 100,
    defaultTtlMs: 15 * 60 * 1000, // 15 minutes
  },
  ksga: {
    source: 'ksga',
    priority: 80,
    defaultTtlMs: 30 * 60 * 1000, // 30 minutes
  },
}

/**
 * Source reconciliation policy.
 *
 * Requirements:
 * - Do NOT automatically merge conflicting sources by coordinates or fuzzy address.
 * - Stations from different sources must preserve distinct identities unless exact operator and station keys match and explicit policy allows.
 * - Chargers within the same station are keyed by (source, operatorId, stationId, chargerId).
 */
export class SourcePolicy {
  constructor(private readonly sourceConfigs: Record<string, SourceConfig> = DEFAULT_SOURCE_CONFIGS) {}

  /**
   * Generates a canonical station key.
   */
  public getStationKey(source: string, operatorId: string | null | undefined, stationId: string): string {
    return `${source}:${operatorId ?? ''}:${stationId}`
  }

  /**
   * Generates a canonical charger key.
   */
  public getChargerKey(
    source: string,
    operatorId: string | null | undefined,
    stationId: string,
    chargerId: string
  ): string {
    return `${source}:${operatorId ?? ''}:${stationId}:${chargerId}`
  }

  /**
   * Checks whether two stations represent the exact same entity across sources.
   * Coordinate or address matching alone is strictly prohibited from merging.
   */
  public canMergeStations(a: ChargerStationRecord, b: ChargerStationRecord): boolean {
    if (a.source !== b.source) {
      // By domain policy, cross-source automatic merging by location is forbidden.
      return false
    }
    return (
      a.operatorId === b.operatorId &&
      a.stationId === b.stationId
    )
  }

  /**
   * Resolves conflicting charger records for the same logical charger.
   * Prioritizes:
   * 1. Source priority
   * 2. Freshness quality (FRESH > STALE > UNKNOWN)
   * 3. Observation timestamp (observedAt)
   */
  public selectPreferredCharger(
    a: ChargerStatusRecord,
    b: ChargerStatusRecord
  ): ChargerStatusRecord {
    const priorityA = this.sourceConfigs[a.source]?.priority ?? 0
    const priorityB = this.sourceConfigs[b.source]?.priority ?? 0

    if (priorityA !== priorityB) {
      return priorityA > priorityB ? a : b
    }

    const freshnessScore = (f: ChargerStatusRecord['freshness']) => {
      if (f === 'FRESH') return 3
      if (f === 'STALE') return 2
      return 1
    }

    const scoreA = freshnessScore(a.freshness)
    const scoreB = freshnessScore(b.freshness)

    if (scoreA !== scoreB) {
      return scoreA > scoreB ? a : b
    }

    const obsA = new Date(a.observedAt).getTime()
    const obsB = new Date(b.observedAt).getTime()
    return obsA >= obsB ? a : b
  }
}
