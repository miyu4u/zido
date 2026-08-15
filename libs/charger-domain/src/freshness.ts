import {
  ChargerSource,
  Freshness,
  MappedChargerStatus,
  EffectiveChargerStatus,
} from './contracts'

/**
 * Options for evaluating freshness.
 */
export interface EvaluateFreshnessOptions {
  /**
   * Status update timestamp from upstream.
   * Can be ISO-8601 string or KECO compact string (YYYYMMDDHHmmss or YYYYMMDDHHmmssSSS).
   */
  statusUpdatedAt: string | null | undefined
  /**
   * Reference time ("now") as ISO-8601 string or Date.
   */
  now: string | Date
  /**
   * Time-to-live in milliseconds.
   */
  ttlMs: number
  /**
   * Optional maximum allowed future skew in milliseconds (defaults to 60,000ms = 1 min).
   * Timestamps exceeding now + maxFutureSkewMs are considered clock skew -> UNKNOWN.
   */
  maxFutureSkewMs?: number
}

/**
 * Parses upstream timestamp into Date.
 * Supports ISO-8601 and YYYYMMDDHHmmss (assume KST/UTC+9 if compact string without timezone).
 */
export function parseUpstreamTimestamp(timestampStr: string | null | undefined): Date | null {
  if (!timestampStr) return null
  const trimmed = timestampStr.trim()
  if (!trimmed) return null

  // Check for KECO compact format: YYYYMMDDHHmmss (14 digits) or with ms (17 digits)
  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})?$/)
  if (compactMatch) {
    const [, year, month, day, hour, min, sec, ms] = compactMatch
    // KECO timestamps are in KST (UTC+9:00)
    const isoKst = `${year}-${month}-${day}T${hour}:${min}:${sec}${ms ? '.' + ms : ''}+09:00`
    const parsed = new Date(isoKst)
    if (isNaN(parsed.getTime())) {
      return null
    }
    return parsed
  }

  // Standard ISO / Date parse
  const parsed = new Date(trimmed)
  if (isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

/**
 * Evaluates freshness based on upstream statusUpdatedAt, current time, and TTL.
 *
 * Rules:
 * 1. Missing, unparseable, or clock skew (future date) -> UNKNOWN
 * 2. Within TTL -> FRESH
 * 3. Expired beyond TTL -> STALE
 */
export function evaluateFreshness(options: EvaluateFreshnessOptions): Freshness {
  const { statusUpdatedAt, now, ttlMs, maxFutureSkewMs = 60000 } = options

  if (!statusUpdatedAt) {
    return 'UNKNOWN'
  }

  const parsedDate = parseUpstreamTimestamp(statusUpdatedAt)
  if (!parsedDate) {
    return 'UNKNOWN'
  }

  const nowDate = typeof now === 'string' ? new Date(now) : now
  if (isNaN(nowDate.getTime())) {
    return 'UNKNOWN'
  }

  const diffMs = nowDate.getTime() - parsedDate.getTime()

  // Future clock skew beyond tolerance
  if (diffMs < -maxFutureSkewMs) {
    return 'UNKNOWN'
  }

  // If timestamp is strictly within TTL
  if (diffMs >= 0 && diffMs <= ttlMs) {
    return 'FRESH'
  }

  // In the slight future within tolerance, or past TTL
  if (diffMs >= 0 && diffMs > ttlMs) {
    return 'STALE'
  }

  // Slight future within maxFutureSkewMs treated as fresh
  if (diffMs < 0 && diffMs >= -maxFutureSkewMs) {
    return 'FRESH'
  }

  return 'STALE'
}

/**
 * Derives effective status from normalizedStatus and freshness.
 *
 * Rules:
 * 1. status = AVAILABLE requires normalizedStatus = AVAILABLE and freshness = FRESH.
 * 2. If freshness = STALE and normalizedStatus = AVAILABLE, downgraded to UNKNOWN.
 * 3. If normalizedStatus is null or UNKNOWN, status is UNKNOWN.
 * 4. If normalizedStatus is CHARGING, UNAVAILABLE, or MAINTENANCE, freshness does not change the categorical failure/busy state.
 *    (However, if freshness is UNKNOWN and normalizedStatus was AVAILABLE, effective status is UNKNOWN).
 */
export function toEffectiveStatus(
  normalizedStatus: MappedChargerStatus,
  freshness: Freshness
): EffectiveChargerStatus {
  if (!normalizedStatus || normalizedStatus === 'UNKNOWN') {
    return 'UNKNOWN'
  }

  if (normalizedStatus === 'AVAILABLE') {
    if (freshness === 'FRESH') {
      return 'AVAILABLE'
    }
    // STALE or UNKNOWN freshness cannot show AVAILABLE
    return 'UNKNOWN'
  }

  // CHARGING, UNAVAILABLE, MAINTENANCE
  return normalizedStatus
}

/**
 * Versioned KECO status mappings.
 *
 * Based on official KECO v1.25 specification:
 * - 1: Communication error / 통신이상 (UNAVAILABLE / MAINTENANCE) -> conservative: UNAVAILABLE
 * - 2: Available / 충전대기 (AVAILABLE)
 * - 3: Charging / 충전중 (CHARGING)
 * - 4: Suspended / 운영중지 (UNAVAILABLE)
 * - 5: Inspection / 점검중 (MAINTENANCE)
 * - 9: Unknown status / 상태미확인 (UNKNOWN)
 * Other unmapped codes -> UNKNOWN
 */
export const KECO_V125_STATUS_MAP: Record<string, MappedChargerStatus> = {
  '1': 'UNAVAILABLE',
  '2': 'AVAILABLE',
  '3': 'CHARGING',
  '4': 'UNAVAILABLE',
  '5': 'MAINTENANCE',
  '9': 'UNKNOWN',
}

/**
 * Normalizes a KECO raw status code according to a specified version (defaulting to v1.25).
 * Unknown / unmapped codes strictly return 'UNKNOWN'.
 */
export function normalizeKecoStatus(
  rawStatus: string | number | null | undefined,
  version: string = 'v1.25'
): MappedChargerStatus {
  if (rawStatus === null || rawStatus === undefined) {
    return 'UNKNOWN'
  }

  const str = String(rawStatus).trim()
  if (!str) {
    return 'UNKNOWN'
  }

  if (version === 'v1.25' || version === '1.25' || !version) {
    return KECO_V125_STATUS_MAP[str] ?? 'UNKNOWN'
  }

  // Fallback for custom version table if future versions introduced
  return KECO_V125_STATUS_MAP[str] ?? 'UNKNOWN'
}

/**
 * Formats an opaque station ID with path segment encoding.
 * Example: makeOpaqueStationId('keco', 'ME', '28260005') -> "keco:ME:28260005"
 * When operatorId is null: makeOpaqueStationId('keco', null, '28260005') -> "keco::28260005"
 */
export function makeOpaqueStationId(
  source: ChargerSource,
  operatorId: string | null | undefined,
  stationId: string
): string {
  const encSource = encodeURIComponent(source.trim())
  const encOp = operatorId ? encodeURIComponent(operatorId.trim()) : ''
  const encStation = encodeURIComponent(stationId.trim())
  return `${encSource}:${encOp}:${encStation}`
}

/**
 * Parses an opaque station ID.
 */
export function parseOpaqueStationId(opaqueId: string): {
  source: string
  operatorId: string | null
  stationId: string
} {
  const parts = opaqueId.split(':')
  if (parts.length < 3) {
    // Fallback if no operator segment
    if (parts.length === 2) {
      return {
        source: decodeURIComponent(parts[0]),
        operatorId: null,
        stationId: decodeURIComponent(parts[1]),
      }
    }
    return {
      source: decodeURIComponent(parts[0] || 'unknown'),
      operatorId: null,
      stationId: decodeURIComponent(parts.slice(1).join(':')),
    }
  }

  const source = decodeURIComponent(parts[0])
  const operatorId = parts[1] ? decodeURIComponent(parts[1]) : null
  const stationId = decodeURIComponent(parts.slice(2).join(':'))

  return {
    source,
    operatorId,
    stationId,
  }
}
