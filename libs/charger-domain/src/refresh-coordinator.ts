import { Injectable, Logger } from '@nestjs/common'
import { McpException } from 'zido/common'
import type { IKecoProvider, KecoInfoItem, KecoStatusItem, ProviderPage } from 'zido/charger-providers'
import { KecoProviderError, KECO_REQUEST_BOUNDS } from 'zido/charger-providers'
import type {
  ChargerSnapshotStore,
  WriteQuerySnapshotInput,
  StationInfoInput,
  ChargerStatusInput,
} from 'zido/charger-storage'
import { normalizeKecoStatus, evaluateFreshness, toEffectiveStatus } from './freshness'

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
    private readonly provider: IKecoProvider,
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
      multiRegionCodes && multiRegionCodes.length > 0
        ? multiRegionCodes
        : singleZcode
          ? [singleZcode]
          : []

    if (!isNationwide && regionCodes.length === 0) {
      throw new McpException('Explicit collection scope is required', 'INVALID_ARGUMENT', 400)
    }

    const observedAt = new Date().toISOString()
    const infoMap = new Map<string, KecoInfoItem>()
    const statusMap = new Map<string, KecoStatusItem>()

    if (isNationwide) {
      const infoPages = await this.collectAllPages(
        (pageNo) =>
          this.provider.fetchInfoPage({
            pageNo,
            numOfRows: KECO_REQUEST_BOUNDS.DEFAULT_NUM_OF_ROWS,
            nationwide: true,
          }),
        maxRetries,
        timeoutMs,
      )
      for (const item of infoPages) {
        infoMap.set(`${item.busiId ?? ''}:${item.statId ?? ''}`, item)
      }

      const statusPages = await this.collectAllPages(
        (pageNo) =>
          this.provider.fetchStatusPage({
            pageNo,
            numOfRows: KECO_REQUEST_BOUNDS.DEFAULT_NUM_OF_ROWS,
            period: periodMinutes,
            nationwide: true,
          }),
        maxRetries,
        timeoutMs,
      )
      for (const item of statusPages) {
        statusMap.set(`${item.busiId ?? ''}:${item.statId ?? ''}:${item.chgerId ?? ''}`, item)
      }
    } else {
      for (const code of regionCodes) {
        const infoPages = await this.collectAllPages(
          (pageNo) =>
            this.provider.fetchInfoPage({
              pageNo,
              numOfRows: KECO_REQUEST_BOUNDS.DEFAULT_NUM_OF_ROWS,
              zcode: code,
            }),
          maxRetries,
          timeoutMs,
        )
        for (const item of infoPages) {
          infoMap.set(`${item.busiId ?? ''}:${item.statId ?? ''}`, item)
        }

        const statusPages = await this.collectAllPages(
          (pageNo) =>
            this.provider.fetchStatusPage({
              pageNo,
              numOfRows: KECO_REQUEST_BOUNDS.DEFAULT_NUM_OF_ROWS,
              period: periodMinutes,
              zcode: code,
            }),
          maxRetries,
          timeoutMs,
        )
        for (const item of statusPages) {
          statusMap.set(`${item.busiId ?? ''}:${item.statId ?? ''}:${item.chgerId ?? ''}`, item)
        }
      }
    }

    const infoItems: KecoInfoItem[] = Array.from(infoMap.values())
    const statusItems: KecoStatusItem[] = Array.from(statusMap.values())

    const now = new Date(observedAt)

    const stations: StationInfoInput[] = infoItems.map((item) => ({
      source,
      operatorId: item.busiId ?? null,
      stationId: item.statId ?? '',
      name: item.statNm ?? null,
      address: item.addr ?? item.address ?? null,
      location: item.lat != null && item.lng != null ? { lat: Number(item.lat), lng: Number(item.lng) } : null,
      access: item.limitYn === 'Y' ? 'RESTRICTED' : 'PUBLIC',
      sourceObservedAt: observedAt,
      sourceVersion: 'v1.25',
    }))

    const chargers: ChargerStatusInput[] = statusItems.map((item) => {
      const normalizedStatus = normalizeKecoStatus(item.stat)
      const freshness = evaluateFreshness({
        statusUpdatedAt: item.statUpdDt ?? null,
        now,
        ttlMs,
      })
      return {
        source,
        operatorId: item.busiId ?? null,
        stationId: item.statId ?? '',
        chargerId: item.chgerId ?? '',
        rawStatus: item.stat ?? null,
        normalizedStatus,
        status: toEffectiveStatus(normalizedStatus, freshness),
        statusUpdatedAt: item.statUpdDt ?? null,
        observedAt,
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
   * Collects all items across pages, stopping at MAX_PAGES or when the
   * provider signals no more items via totalCount / empty page.
   */
  private async collectAllPages<T>(
    fetcher: (pageNo: number) => Promise<ProviderPage<T>>,
    maxRetries: number,
    timeoutMs: number,
  ): Promise<T[]> {
    const collected: T[] = []

    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await this.fetchWithRetry(fetcher, page, maxRetries, timeoutMs)
      collected.push(...result.items)

      const total = result.totalCount ?? 0
      if (result.items.length === 0 || collected.length >= total) break
    }

    return collected
  }

  /**
   * Retries a single provider fetch up to maxRetries times for retryable
   * errors.  Non-retryable errors (AUTH, QUOTA, …) are rethrown immediately.
   * Backoff: 100 ms × 2^attempt (capped implicitly by maxRetries ≤ 5).
   */
  private async fetchWithRetry<T>(
    fetcher: (pageNo: number) => Promise<ProviderPage<T>>,
    pageNo: number,
    maxRetries: number,
    timeoutMs: number,
  ): Promise<ProviderPage<T>> {
    let lastErr: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await withTimeout(fetcher(pageNo), timeoutMs)
      } catch (err: unknown) {
        lastErr = err
        const retryable = err instanceof KecoProviderError ? err.retryable : false
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
              new KecoProviderError('KECO refresh timed out', {
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
