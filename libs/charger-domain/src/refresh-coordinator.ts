import { Injectable, Logger } from '@nestjs/common'
import { McpException } from 'zido/common'
import type {
  ChargerInfoRecord,
  ChargerProviderContract,
  ChargerProviderScope,
  ChargerStatusRecord,
} from 'zido/charger-providers'
import { KecoException, KecoUpstreamProviderException, KECO_REQUEST_BOUNDS } from 'zido/charger-providers'
import type {
  ChargerSnapshotStore,
  WriteQuerySnapshotInput,
  StationInfoInput,
  ChargerStatusInput,
} from 'zido/charger-storage'
import { evaluateFreshness, toEffectiveStatus } from './freshness'

/** Hard cap on provider pages fetched per refresh to prevent infinite pagination. */
const MAX_PAGES = 50

export type RefreshScope =
  | { regionCodes: string[]; nationwide?: never; zcode?: never }
  | { nationwide: true; regionCodes?: never; zcode?: never }
  | { zcode: string; regionCodes?: never; nationwide?: never }

export interface RefreshOptions {
  queryKey: string
  source: 'keco'
  zcode?: string
  regionCodes?: string[]
  nationwide?: boolean
  /** Status update window forwarded to KECO in minutes. */
  periodMinutes?: number
  ttlMs: number
  /** Maximum number of retries per retryable provider failure (default 2). */
  maxRetries?: number
  timeoutMs?: number
  /** Atomic snapshot과 함께 보존할 scope/provenance metadata다. */
  metadata?: Record<string, unknown>
}

/**
 * Single-flight refresh coordinator.
 *
 * Concurrent callers with the same queryKey share one in-flight provider
 * call — only the first caller triggers collection; the rest await the same
 * promise.  Pagination is bounded by MAX_PAGES regardless of totalCount.
 * Non-retryable provider errors (AUTH, QUOTA, CONTRACT_CHANGED, …) propagate
 * immediately without retry.
 */
@Injectable()
export class RefreshCoordinator {
  private readonly logger = new Logger(RefreshCoordinator.name)
  private readonly inFlight = new Map<string, Promise<void>>()

  constructor(
    private readonly provider: ChargerProviderContract,
    private readonly store: ChargerSnapshotStore,
  ) {}

  /**
   * Ensures at most one provider refresh is in-flight per queryKey.
   * Returns when the snapshot has been written (or the underlying call has
   * thrown — callers must handle rejection).
   */
  async refresh(options: RefreshOptions): Promise<void> {
    const { queryKey } = options
    const existing = this.inFlight.get(queryKey)
    if (existing) return existing

    const promise = this.doRefresh(options).finally(() => {
      this.inFlight.delete(queryKey)
    })
    this.inFlight.set(queryKey, promise)
    return promise
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async doRefresh(options: RefreshOptions): Promise<void> {
    const {
      queryKey,
      source,
      zcode: singleZcode,
      regionCodes: multiRegionCodes,
      nationwide: isNationwideExplicit,
      periodMinutes = KECO_REQUEST_BOUNDS.DEFAULT_PERIOD,
      ttlMs,
      maxRetries = 2,
      timeoutMs = 8_000,
      metadata,
    } = options

    const isNationwide = isNationwideExplicit === true
    const regionCodes =
      multiRegionCodes && multiRegionCodes.length > 0 ? multiRegionCodes : singleZcode ? [singleZcode] : []

    if (!isNationwide && regionCodes.length === 0) {
      throw new McpException('Explicit collection scope is required', 'INVALID_ARGUMENT', 400)
    }

    const observedAt = new Date().toISOString()
    const infoMap = new Map<string, ChargerInfoRecord>()
    const statusMap = new Map<string, ChargerStatusRecord>()
    const pageSize = this.provider.capabilities.limits.pageSize.max
    const scopes: ChargerProviderScope[] = isNationwide
      ? [{ type: 'NATIONWIDE', countryCode: 'KR' }]
      : regionCodes.map((regionCode) => ({
          type: 'REGION' as const,
          countryCode: 'KR',
          regionCode,
        }))
    const fetchStatusPage = this.provider.fetchStatusPage

    if (!fetchStatusPage) {
      throw new McpException('Configured charger provider does not support status collection', 'INTERNAL_ERROR', 500)
    }

    for (const scope of scopes) {
      const infoPages = await this.collectAllPages(
        (page) =>
          this.provider.fetchInfoPage({
            scope,
            pagination: { type: 'PAGE', page, pageSize },
          }),
        maxRetries,
        timeoutMs,
      )
      for (const item of infoPages) {
        infoMap.set(`${item.operatorId ?? ''}:${item.stationId}`, item)
      }

      const statusPages = await this.collectAllPages(
        (page) =>
          fetchStatusPage.call(this.provider, {
            scope,
            pagination: { type: 'PAGE', page, pageSize },
            updatedWithinMinutes: periodMinutes,
          }),
        maxRetries,
        timeoutMs,
      )
      for (const item of statusPages) {
        statusMap.set(`${item.operatorId ?? ''}:${item.stationId}:${item.chargerId ?? ''}`, item)
      }
    }

    const infoItems = Array.from(infoMap.values())
    const statusItems = Array.from(statusMap.values())

    const now = new Date(observedAt)

    const stations: StationInfoInput[] = infoItems.map((item) => ({
      source,
      operatorId: item.operatorId,
      stationId: item.stationId,
      name: item.name,
      address: item.address,
      location: item.location,
      access: item.access,
      sourceObservedAt: observedAt,
      sourceVersion: 'v1.25',
    }))

    const chargers: ChargerStatusInput[] = statusItems.map((item) => {
      const normalizedStatus =
        item.status === 'OUT_OF_SERVICE' || item.status === 'RESERVED' ? 'UNAVAILABLE' : item.status
      const freshness = evaluateFreshness({
        statusUpdatedAt: item.statusUpdatedAt,
        now,
        ttlMs,
      })
      return {
        source,
        operatorId: item.operatorId,
        stationId: item.stationId,
        chargerId: item.chargerId ?? '',
        rawStatus: item.rawStatus,
        normalizedStatus,
        status: toEffectiveStatus(normalizedStatus, freshness),
        statusUpdatedAt: item.statusUpdatedAt,
        observedAt: item.observedAt,
        freshness,
        sourceVersion: 'v1.25',
      }
    })

    const input: WriteQuerySnapshotInput = {
      queryKey,
      source,
      observedAt,
      stations,
      chargers,
      metadata,
    }

    await this.store.writeQuerySnapshot(input)
    this.logger.log(
      `[RefreshCoordinator] snapshot written queryKey=${queryKey} ` +
        `stations=${stations.length} chargers=${chargers.length}`,
    )
  }

  /**
   * Collects all items across pages, stopping at MAX_PAGES, an empty page,
   * or the provider's explicit hasNext boundary.
   */
  private async collectAllPages<T>(
    fetcher: (page: number) => Promise<{ items: T[]; hasNext: boolean }>,
    maxRetries: number,
    timeoutMs: number,
  ): Promise<T[]> {
    const collected: T[] = []

    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await this.fetchWithRetry(fetcher, page, maxRetries, timeoutMs)
      collected.push(...result.items)

      if (result.items.length === 0 || !result.hasNext) break
    }

    return collected
  }

  /**
   * Retries a single provider fetch up to maxRetries times for retryable
   * errors.  Non-retryable errors (AUTH, QUOTA, …) are rethrown immediately.
   * Backoff: 100 ms × 2^attempt (capped implicitly by maxRetries ≤ 5).
   */
  private async fetchWithRetry<T>(
    fetcher: (page: number) => Promise<T>,
    page: number,
    maxRetries: number,
    timeoutMs: number,
  ): Promise<T> {
    let lastErr: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await withTimeout(fetcher(page), timeoutMs)
      } catch (err: unknown) {
        lastErr = err
        const retryable = err instanceof KecoException ? err.retryable : false
        if (!retryable || attempt >= maxRetries) throw err
        await new Promise<void>((resolve) => setTimeout(resolve, 100 * 2 ** attempt))
      }
    }

    // Should be unreachable, but TypeScript needs a guaranteed return.
    throw lastErr
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new KecoUpstreamProviderException('KECO refresh timed out', {
                failureKind: 'TIMEOUT',
                retryable: true,
              }),
            ),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
