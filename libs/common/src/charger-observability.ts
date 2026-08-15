export type ChargerMetricFreshness = 'FRESH' | 'STALE' | 'UNKNOWN'

export interface ChargerMetricEvent {
  provider: string
  endpoint: string
  resultCode?: string
  httpStatus?: number
  latencyMs: number
  itemCount?: number
  freshness?: ChargerMetricFreshness
  retryCount?: number
  quotaState?: string
}

export const DEFAULT_TELEMETRY_MAX_EVENTS = 1000

/**
 * Small process-local telemetry sink for the charging boundary.
 *
 * The event contract intentionally contains endpoint paths rather than URLs,
 * so a ServiceKey or arbitrary external query can never become a metric tag.
 * Production applications can adapt this sink to their metrics backend.
 */
export class ChargerTelemetry {
  private readonly events: ChargerMetricEvent[] = []
  private readonly maxEvents: number

  constructor(maxEvents = DEFAULT_TELEMETRY_MAX_EVENTS) {
    this.maxEvents = Math.max(1, maxEvents)
  }

  record(event: ChargerMetricEvent): void {
    if (this.events.length >= this.maxEvents) {
      this.events.shift()
    }

    this.events.push({
      ...event,
      provider: event.provider.replace(/[^a-z0-9_-]/gi, ''),
      endpoint: normalizeEndpoint(event.endpoint),
      resultCode: event.resultCode?.replace(/[^a-z0-9_-]/gi, '').slice(0, 32),
      quotaState: event.quotaState?.replace(/[^a-z0-9_-]/gi, '').slice(0, 32),
    })
  }

  snapshot(): ChargerMetricEvent[] {
    return this.events.map((event) => ({ ...event }))
  }

  clear(): void {
    this.events.length = 0
  }
}

function normalizeEndpoint(endpoint: string): string {
  if (!endpoint.startsWith('/')) return '/unknown'
  return endpoint.split('?')[0].slice(0, 128)
}
