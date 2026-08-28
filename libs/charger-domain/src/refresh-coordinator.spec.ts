import type { ChargerSnapshotStore } from 'zido/charger-storage'
import type { ChargerInfoRecord, ChargerProviderContract, ChargerStatusRecord } from 'zido/charger-providers'
import { KecoUpstreamProviderException } from 'zido/charger-providers'
import { RefreshCoordinator } from './refresh-coordinator'

const observedAt = '2026-08-29T00:00:00.000Z'
const capabilities: ChargerProviderContract['capabilities'] = {
  scopes: ['NATIONWIDE', 'REGION'],
  pagination: ['PAGE'],
  status: 'DYNAMIC',
  connectorDetails: true,
  powerDetails: true,
  tariffs: false,
  limits: {
    pageSize: { min: 10, max: 9_999 },
    statusUpdatedWithinMinutes: { min: 1, max: 10 },
    radiusMetersMax: null,
  },
}

function page<T>(pageNumber: number, totalCount: number, items: T[]) {
  return {
    providerId: 'keco',
    page: pageNumber,
    pageSize: 1,
    totalCount,
    nextCursor: null,
    hasNext: pageNumber < totalCount,
    observedAt,
    providerMetadata: {},
    items,
  }
}

function fakeProvider(
  overrides: Partial<Pick<ChargerProviderContract, 'fetchInfoPage' | 'fetchStatusPage'>> = {},
): jest.Mocked<ChargerProviderContract> {
  return {
    providerId: 'keco',
    capabilities,
    fetchInfoPage: jest.fn().mockResolvedValue(page(1, 0, [])),
    fetchStatusPage: jest.fn().mockResolvedValue(page(1, 0, [])),
    ...overrides,
  } as jest.Mocked<ChargerProviderContract>
}

function infoRecord(overrides: Partial<ChargerInfoRecord> = {}): ChargerInfoRecord {
  return {
    providerId: 'keco',
    operatorId: 'ME',
    operatorName: '환경부',
    stationId: 'ST-1',
    chargerId: '01',
    name: '첫 충전소',
    address: '서울',
    addressDetail: null,
    location: { lat: 37.5, lng: 127 },
    access: 'PUBLIC',
    operatingHours: null,
    connectors: [],
    ...overrides,
  }
}

function statusRecord(overrides: Partial<ChargerStatusRecord> = {}): ChargerStatusRecord {
  return {
    providerId: 'keco',
    operatorId: 'ME',
    stationId: 'ST-1',
    chargerId: '01',
    status: 'AVAILABLE',
    rawStatus: '2',
    statusUpdatedAt: null,
    observedAt,
    availableCount: 1,
    outOfServiceCount: 0,
    totalCount: 1,
    ...overrides,
  }
}

function store(): jest.Mocked<ChargerSnapshotStore> {
  return {
    readQuerySnapshot: jest.fn(),
    writeQuerySnapshot: jest.fn().mockResolvedValue(undefined),
    upsertStationInfo: jest.fn(),
    upsertChargerStatus: jest.fn(),
    findStation: jest.fn(),
    findChargers: jest.fn(),
    getQueryCacheMetadata: jest.fn(),
    close: jest.fn(),
  } as unknown as jest.Mocked<ChargerSnapshotStore>
}

describe('RefreshCoordinator', () => {
  it('info/status multi-page를 수집해 기존 snapshot payload로 mapping한다', async () => {
    const secondInfo = infoRecord({
      stationId: 'ST-2',
      chargerId: '02',
      name: '둘째 충전소',
      address: '인천',
      location: null,
      access: 'RESTRICTED',
    })
    const secondStatus = statusRecord({
      stationId: 'ST-2',
      chargerId: '02',
      status: 'CHARGING',
      rawStatus: '3',
      availableCount: 0,
    })
    const provider = fakeProvider({
      fetchInfoPage: jest
        .fn()
        .mockResolvedValueOnce(page(1, 2, [infoRecord()]))
        .mockResolvedValueOnce(page(2, 2, [secondInfo])),
      fetchStatusPage: jest
        .fn()
        .mockResolvedValueOnce(page(1, 2, [statusRecord()]))
        .mockResolvedValueOnce(page(2, 2, [secondStatus])),
    })
    const snapshotStore = store()

    await new RefreshCoordinator(provider, snapshotStore).refresh({
      queryKey: 'keco:11',
      source: 'keco',
      zcode: '11',
      periodMinutes: 7,
      ttlMs: 900_000,
    })

    expect(provider.fetchInfoPage).toHaveBeenNthCalledWith(2, {
      scope: { type: 'REGION', countryCode: 'KR', regionCode: '11' },
      pagination: { type: 'PAGE', page: 2, pageSize: 9_999 },
    })
    expect(provider.fetchStatusPage).toHaveBeenNthCalledWith(2, {
      scope: { type: 'REGION', countryCode: 'KR', regionCode: '11' },
      pagination: { type: 'PAGE', page: 2, pageSize: 9_999 },
      updatedWithinMinutes: 7,
    })
    expect(snapshotStore.writeQuerySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: 'keco:11',
        source: 'keco',
        stations: [
          expect.objectContaining({ stationId: 'ST-1', name: '첫 충전소', location: { lat: 37.5, lng: 127 } }),
          expect.objectContaining({ stationId: 'ST-2', address: '인천', access: 'RESTRICTED' }),
        ],
        chargers: [
          expect.objectContaining({ stationId: 'ST-1', chargerId: '01', normalizedStatus: 'AVAILABLE' }),
          expect.objectContaining({ stationId: 'ST-2', chargerId: '02', normalizedStatus: 'CHARGING' }),
        ],
      }),
    )
  })

  it('다중 region payload를 identity로 dedupe한 뒤 snapshot을 한 번만 atomic write한다', async () => {
    const provider = fakeProvider({
      fetchInfoPage: jest.fn().mockResolvedValue(page(1, 1, [infoRecord({ name: '경계 충전소' })])),
      fetchStatusPage: jest.fn().mockResolvedValue(page(1, 1, [statusRecord()])),
    })
    const snapshotStore = store()

    await new RefreshCoordinator(provider, snapshotStore).refresh({
      queryKey: 'keco:11,41',
      source: 'keco',
      regionCodes: ['11', '41'],
      ttlMs: 900_000,
      metadata: {
        provenance: { version: '2026.08', source: 'fixture' },
      },
    })

    expect(provider.fetchInfoPage).toHaveBeenCalledTimes(2)
    expect(provider.fetchStatusPage).toHaveBeenCalledTimes(2)
    expect(provider.fetchInfoPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ scope: { type: 'REGION', countryCode: 'KR', regionCode: '11' } }),
    )
    expect(provider.fetchInfoPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ scope: { type: 'REGION', countryCode: 'KR', regionCode: '41' } }),
    )
    expect(snapshotStore.writeQuerySnapshot).toHaveBeenCalledTimes(1)
    expect(snapshotStore.writeQuerySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        stations: [expect.objectContaining({ stationId: 'ST-1' })],
        chargers: [expect.objectContaining({ stationId: 'ST-1', chargerId: '01' })],
        metadata: {
          provenance: { version: '2026.08', source: 'fixture' },
        },
      }),
    )
  })

  it('provider가 empty page를 반환하면 다음 page를 요청하지 않는다', async () => {
    const provider = fakeProvider({
      fetchInfoPage: jest.fn().mockResolvedValue({ ...page(1, 10, []), hasNext: true }),
      fetchStatusPage: jest.fn().mockResolvedValue({ ...page(1, 10, []), hasNext: true }),
    })

    await new RefreshCoordinator(provider, store()).refresh({
      queryKey: 'keco:empty',
      source: 'keco',
      ttlMs: 900_000,
      nationwide: true,
    })

    expect(provider.fetchInfoPage).toHaveBeenCalledTimes(1)
    expect(provider.fetchInfoPage).toHaveBeenCalledWith({
      scope: { type: 'NATIONWIDE', countryCode: 'KR' },
      pagination: { type: 'PAGE', page: 1, pageSize: 9_999 },
    })
    expect(provider.fetchStatusPage).toHaveBeenCalledTimes(1)
  })

  it('retryable failure는 재시도하고 non-retryable failure는 즉시 전파한다', async () => {
    const retryable = new KecoUpstreamProviderException('timeout', {
      failureKind: 'TIMEOUT',
      retryable: true,
    })
    const retryProvider = fakeProvider({
      fetchInfoPage: jest
        .fn()
        .mockRejectedValueOnce(retryable)
        .mockResolvedValue(page(1, 0, [])),
    })

    await new RefreshCoordinator(retryProvider, store()).refresh({
      queryKey: 'keco:retry',
      source: 'keco',
      ttlMs: 900_000,
      maxRetries: 1,
      nationwide: true,
    })
    expect(retryProvider.fetchInfoPage).toHaveBeenCalledTimes(2)

    const hardFailure = new KecoUpstreamProviderException('auth', {
      failureKind: 'AUTHENTICATION',
      retryable: false,
    })
    const hardProvider = fakeProvider({
      fetchInfoPage: jest.fn().mockRejectedValue(hardFailure),
      fetchStatusPage: jest.fn(),
    })

    await expect(
      new RefreshCoordinator(hardProvider, store()).refresh({
        queryKey: 'keco:hard',
        source: 'keco',
        ttlMs: 900_000,
        maxRetries: 3,
        nationwide: true,
      }),
    ).rejects.toBe(hardFailure)
    expect(hardProvider.fetchInfoPage).toHaveBeenCalledTimes(1)
    expect(hardProvider.fetchStatusPage).not.toHaveBeenCalled()
  })
})
