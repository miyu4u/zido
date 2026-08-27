/**
 * Focused unit tests for ChargerService + RefreshCoordinator.
 *
 * All I/O is replaced by fake spy objects — no SQLite, no HTTP calls.
 *
 * Scenarios covered:
 *   1. Cache hit          — zero provider calls when snapshot is FRESH.
 *   2. Concurrent miss    — one provider call even with N simultaneous callers.
 *   3. Stale fallback     — provider fails but stale cached snapshot is returned.
 *   4. Cold failure       — no cache + provider fails → McpException SNAPSHOT_UNAVAILABLE.
 *   5. Retry policy       — retryable error is retried; non-retryable is not.
 *   6. Opaque station ID  — getStation() decodes opaque ID and returns record;
 *                           unknown ID throws McpException NOT_FOUND.
 */

import { ChargerService, GetSnapshotOptions } from './charger-service'
import { RefreshCoordinator, RefreshOptions } from './refresh-coordinator'
import type { ChargerSnapshotStore, QuerySnapshotBundle } from 'zido/charger-storage'
import type { IKecoProvider, ProviderPage, KecoStatusItem, KecoInfoItem } from 'zido/charger-providers'
import { KecoProviderError } from 'zido/charger-providers'
import { McpException } from 'zido/common'
import { makeOpaqueStationId } from './freshness'
import type { ChargerStationRecord } from './contracts'

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

/** Minimal valid QuerySnapshotBundle */
function makeBundle(overrides: Partial<QuerySnapshotBundle> = {}): QuerySnapshotBundle {
  return {
    queryKey: 'keco:all',
    source: 'keco',
    observedAt: new Date().toISOString(),
    isStale: false,
    itemCount: 1,
    stations: [],
    chargers: [],
    ...overrides,
  }
}

/** Empty but valid provider page */
function emptyPage<T>(overrides: Partial<ProviderPage<T>> = {}): ProviderPage<T> {
  return {
    resultCode: '00',
    resultMsg: 'OK',
    pageNo: 1,
    numOfRows: 9999,
    totalCount: 0,
    items: [],
    ...overrides,
  }
}

/** Builds a fake store with jest.fn() for every abstract method. */
function fakeStore(
  overrides: Partial<Record<keyof ChargerSnapshotStore, jest.Mock>> = {},
): jest.Mocked<ChargerSnapshotStore> {
  return {
    readQuerySnapshot: jest.fn().mockResolvedValue(null),
    writeQuerySnapshot: jest.fn().mockResolvedValue(undefined),
    upsertStationInfo: jest.fn().mockResolvedValue(undefined),
    upsertChargerStatus: jest.fn().mockResolvedValue(undefined),
    findStation: jest.fn().mockResolvedValue(null),
    findChargers: jest.fn().mockResolvedValue([]),
    getQueryCacheMetadata: jest.fn().mockResolvedValue(null),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<ChargerSnapshotStore>
}

/** Builds a fake IKecoProvider. */
function fakeProvider(
  overrides: Partial<{ fetchStatusPage: jest.Mock; fetchInfoPage: jest.Mock }> = {},
): jest.Mocked<IKecoProvider> {
  return {
    fetchStatusPage: jest.fn().mockResolvedValue(emptyPage<KecoStatusItem>()),
    fetchInfoPage: jest.fn().mockResolvedValue(emptyPage<KecoInfoItem>()),
    ...overrides,
  } as unknown as jest.Mocked<IKecoProvider>
}

/** Retryable provider error */
function retryableErr(msg = 'timeout'): KecoProviderError {
  return new KecoProviderError(msg, { failureKind: 'TIMEOUT', retryable: true })
}

/** Non-retryable provider error */
function hardErr(msg = 'auth'): KecoProviderError {
  return new KecoProviderError(msg, { failureKind: 'AUTHENTICATION', retryable: false })
}

// Default query options used in most tests
const OPTS: GetSnapshotOptions = { ttlMs: 15 * 60 * 1000, source: 'keco', zcode: '11' }
const QUERY_KEY = 'keco:all'

// ---------------------------------------------------------------------------
// 1. Cache hit — zero provider calls
// ---------------------------------------------------------------------------

describe('ChargerService – cache hit', () => {
  it('returns the fresh cached snapshot without calling the provider', async () => {
    const freshBundle = makeBundle({ isStale: false })
    const store = fakeStore({
      readQuerySnapshot: jest.fn().mockResolvedValue(freshBundle),
    })
    const provider = fakeProvider()
    const coordinator = new RefreshCoordinator(provider, store)
    const service = new ChargerService(store, coordinator)

    const result = await service.getSnapshot(QUERY_KEY, OPTS)

    expect(result).toBe(freshBundle)
    expect(provider.fetchStatusPage).not.toHaveBeenCalled()
    expect(provider.fetchInfoPage).not.toHaveBeenCalled()
    // writeQuerySnapshot must also be untouched
    expect(store.writeQuerySnapshot).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2. Concurrent miss — exactly one provider call
// ---------------------------------------------------------------------------

describe('ChargerService – concurrent miss (single-flight)', () => {
  it('fires the provider exactly once when N callers miss simultaneously', async () => {
    // First read: cache miss.  Second read (after refresh): return bundle.
    const bundle = makeBundle()
    const readMock = jest
      .fn()
      .mockResolvedValueOnce(null) // first caller's initial read (miss)
      .mockResolvedValue(bundle) // all subsequent reads after refresh

    const store = fakeStore({ readQuerySnapshot: readMock })
    const provider = fakeProvider()
    const coordinator = new RefreshCoordinator(provider, store)
    const service = new ChargerService(store, coordinator)

    // Launch 5 concurrent callers
    const results = await Promise.all(Array.from({ length: 5 }, () => service.getSnapshot(QUERY_KEY, OPTS)))

    // Provider must have been called exactly once per page type
    expect(provider.fetchStatusPage).toHaveBeenCalledTimes(1)
    expect(provider.fetchInfoPage).toHaveBeenCalledTimes(1)
    expect(store.writeQuerySnapshot).toHaveBeenCalledTimes(1)
    results.forEach((r) => expect(r).toBe(bundle))
  })
})

// ---------------------------------------------------------------------------
// 3. Stale fallback — provider fails, cached stale snapshot is returned
// ---------------------------------------------------------------------------

describe('ChargerService – stale fallback', () => {
  it('returns the stale snapshot when the provider throws after a successful past write', async () => {
    const staleBundle = makeBundle({ isStale: true })
    // First read: returns stale (triggers refresh attempt)
    // Second read (after failed refresh): returns stale again
    const readMock = jest.fn().mockResolvedValue(staleBundle)
    const store = fakeStore({ readQuerySnapshot: readMock })
    const provider = fakeProvider({
      fetchInfoPage: jest.fn().mockRejectedValue(hardErr('quota')),
    })
    const coordinator = new RefreshCoordinator(provider, store)
    const service = new ChargerService(store, coordinator)

    const result = await service.getSnapshot(QUERY_KEY, OPTS)

    expect(result).toBe(staleBundle)
    expect(store.readQuerySnapshot).toHaveBeenLastCalledWith(QUERY_KEY, { ttlMs: OPTS.ttlMs })
    expect(store.writeQuerySnapshot).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 4. Cold failure — no cache, provider fails → SNAPSHOT_UNAVAILABLE
// ---------------------------------------------------------------------------

describe('ChargerService – cold failure', () => {
  it('throws McpException SNAPSHOT_UNAVAILABLE when no snapshot exists and provider fails', async () => {
    const store = fakeStore({
      readQuerySnapshot: jest.fn().mockResolvedValue(null),
    })
    const provider = fakeProvider({
      fetchInfoPage: jest.fn().mockRejectedValue(hardErr('auth')),
    })
    const coordinator = new RefreshCoordinator(provider, store)
    const service = new ChargerService(store, coordinator)

    await expect(service.getSnapshot(QUERY_KEY, OPTS)).rejects.toMatchObject({
      code: 'SNAPSHOT_UNAVAILABLE',
      status: 503,
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Retry policy
// ---------------------------------------------------------------------------

describe('RefreshCoordinator – retry policy', () => {
  it('retries a retryable error up to maxRetries times then propagates', async () => {
    const store = fakeStore()
    const fetchMock = jest.fn().mockRejectedValue(retryableErr('timeout'))
    const provider = fakeProvider({ fetchInfoPage: fetchMock })
    const coordinator = new RefreshCoordinator(provider, store)

    const opts: RefreshOptions = {
      queryKey: QUERY_KEY,
      source: 'keco',
      ttlMs: 900_000,
      maxRetries: 2,
      nationwide: true,
    }
    await expect(coordinator.refresh(opts)).rejects.toBeInstanceOf(KecoProviderError)

    // 1 initial attempt + 2 retries = 3 total calls
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(store.writeQuerySnapshot).not.toHaveBeenCalled()
  })

  it('does NOT retry a non-retryable error', async () => {
    const store = fakeStore()
    const fetchMock = jest.fn().mockRejectedValue(hardErr('auth'))
    const provider = fakeProvider({ fetchInfoPage: fetchMock })
    const coordinator = new RefreshCoordinator(provider, store)

    const opts: RefreshOptions = {
      queryKey: QUERY_KEY,
      source: 'keco',
      ttlMs: 900_000,
      maxRetries: 3,
      nationwide: true,
    }
    await expect(coordinator.refresh(opts)).rejects.toBeInstanceOf(KecoProviderError)

    // Exactly 1 call — no retries for non-retryable
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('succeeds on second attempt when first attempt is retryable', async () => {
    const store = fakeStore()
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(retryableErr('flake'))
      .mockResolvedValue(emptyPage<KecoInfoItem>())
    const provider = fakeProvider({
      fetchInfoPage: fetchMock,
      fetchStatusPage: jest.fn().mockResolvedValue(emptyPage()),
    })
    const coordinator = new RefreshCoordinator(provider, store)

    const opts: RefreshOptions = {
      queryKey: QUERY_KEY,
      source: 'keco',
      ttlMs: 900_000,
      maxRetries: 2,
      nationwide: true,
    }
    await coordinator.refresh(opts)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.writeQuerySnapshot).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// 6. Opaque station detail
// ---------------------------------------------------------------------------

describe('ChargerService – getStation (opaque station ID)', () => {
  const stationRecord: ChargerStationRecord = {
    source: 'keco',
    operatorId: 'ME',
    stationId: '28260005',
    name: '테스트 충전소',
    address: '서울특별시 중구',
    location: { lat: 37.5665, lng: 126.978 },
    access: 'PUBLIC',
    chargers: [],
    sourceObservedAt: new Date().toISOString(),
    sourceVersion: 'v1.25',
  }

  it('returns station record for a valid opaque stationId', async () => {
    const opaqueId = makeOpaqueStationId('keco', 'ME', '28260005')
    const store = fakeStore({
      findStation: jest.fn().mockResolvedValue(stationRecord),
    })
    const coordinator = new RefreshCoordinator(fakeProvider(), store)
    const service = new ChargerService(store, coordinator)

    const result = await service.getStation(opaqueId)

    expect(result).toBe(stationRecord)
    expect(store.findStation).toHaveBeenCalledWith('28260005', {
      source: 'keco',
      operatorId: 'ME',
    })
  })

  it('status 조회는 local snapshot만 읽고 provider collection을 시작하지 않는다', async () => {
    const opaqueId = makeOpaqueStationId('keco', 'ME', '28260005')
    const store = fakeStore({
      findStation: jest.fn().mockResolvedValue(stationRecord),
    })
    const provider = fakeProvider()
    const service = new ChargerService(store, new RefreshCoordinator(provider, store))

    const result = await service.getStatus(opaqueId)

    expect(result).toBe(stationRecord)
    expect(provider.fetchInfoPage).not.toHaveBeenCalled()
    expect(provider.fetchStatusPage).not.toHaveBeenCalled()
    expect(store.writeQuerySnapshot).not.toHaveBeenCalled()
  })

  it('throws McpException NOT_FOUND for an unknown opaque stationId', async () => {
    const opaqueId = makeOpaqueStationId('keco', 'ZZ', '00000000')
    const store = fakeStore({ findStation: jest.fn().mockResolvedValue(null) })
    const coordinator = new RefreshCoordinator(fakeProvider(), store)
    const service = new ChargerService(store, coordinator)

    await expect(service.getStation(opaqueId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  it('recalculates an old AVAILABLE charger as stale UNKNOWN on detail reads', async () => {
    const opaqueId = makeOpaqueStationId('keco', 'ME', '28260005')
    const store = fakeStore({
      findStation: jest.fn().mockResolvedValue({
        ...stationRecord,
        chargers: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: '28260005',
            chargerId: '01',
            rawStatus: '2',
            normalizedStatus: 'AVAILABLE',
            status: 'AVAILABLE',
            statusUpdatedAt: '2020-01-01T00:00:00.000Z',
            observedAt: '2020-01-01T00:00:00.000Z',
            freshness: 'FRESH',
            sourceVersion: 'v1.25',
          },
        ],
      }),
    })
    const coordinator = new RefreshCoordinator(fakeProvider(), store)
    const service = new ChargerService(store, coordinator)

    const result = await service.getStation(opaqueId)

    expect(result.chargers[0]).toMatchObject({ freshness: 'STALE', status: 'UNKNOWN' })
  })

  it('forces detail chargers stale when the station snapshot TTL has expired', async () => {
    const opaqueId = makeOpaqueStationId('keco', 'ME', '28260005')
    const store = fakeStore({
      findStation: jest.fn().mockResolvedValue({
        ...stationRecord,
        sourceObservedAt: '2020-01-01T00:00:00.000Z',
        chargers: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: '28260005',
            chargerId: '01',
            rawStatus: '2',
            normalizedStatus: 'AVAILABLE',
            status: 'AVAILABLE',
            statusUpdatedAt: new Date().toISOString(),
            observedAt: new Date().toISOString(),
            freshness: 'FRESH',
            sourceVersion: 'v1.25',
          },
        ],
      }),
    })
    const service = new ChargerService(store, new RefreshCoordinator(fakeProvider(), store))

    const result = await service.getStation(opaqueId)

    expect(result.chargers[0]).toMatchObject({ freshness: 'STALE', status: 'UNKNOWN' })
  })

  it('maps a cold provider rate limit to the stable 429 contract', async () => {
    const store = fakeStore({ readQuerySnapshot: jest.fn().mockResolvedValue(null) })
    const provider = fakeProvider({
      fetchInfoPage: jest
        .fn()
        .mockRejectedValue(new KecoProviderError('provider detail', { failureKind: 'RATE_LIMITED', retryable: false })),
    })
    const service = new ChargerService(store, new RefreshCoordinator(provider, store))

    await expect(service.getSnapshot(QUERY_KEY, OPTS)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    })
  })

  it('passes the configured period and region to refresh requests', async () => {
    const store = fakeStore({
      readQuerySnapshot: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(makeBundle()),
    })
    const provider = fakeProvider()
    const service = new ChargerService(store, new RefreshCoordinator(provider, store))

    await service.getSnapshot('region-query', {
      ttlMs: OPTS.ttlMs,
      source: 'keco',
      zcode: '28',
      periodMinutes: 7,
    })

    expect(provider.fetchInfoPage).toHaveBeenCalledWith(expect.objectContaining({ zcode: '28' }))
    expect(provider.fetchStatusPage).toHaveBeenCalledWith(expect.objectContaining({ zcode: '28', period: 7 }))
  })

  it('round-trips opaque IDs with null operatorId', async () => {
    const opaqueId = makeOpaqueStationId('keco', null, 'SOLO001')
    const store = fakeStore({ findStation: jest.fn().mockResolvedValue(stationRecord) })
    const coordinator = new RefreshCoordinator(fakeProvider(), store)
    const service = new ChargerService(store, coordinator)

    await service.getStation(opaqueId)

    expect(store.findStation).toHaveBeenCalledWith('SOLO001', {
      source: 'keco',
      operatorId: null,
    })
  })
})
