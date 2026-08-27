import type { ChargerSnapshotStore } from 'zido/charger-storage'
import type { IKecoProvider, KecoInfoItem, KecoStatusItem, ProviderPage } from 'zido/charger-providers'
import { KecoProviderError } from 'zido/charger-providers'
import { RefreshCoordinator } from './refresh-coordinator'

function page<T>(pageNo: number, totalCount: number, items: T[]): ProviderPage<T> {
  return { resultCode: '00', resultMsg: 'OK', pageNo, numOfRows: 1, totalCount, items }
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
    const infoItems = [
      {
        busiId: 'ME',
        statId: 'ST-1',
        statNm: '첫 충전소',
        addr: '서울',
        address: null,
        lat: 37.5,
        lng: 127.0,
        limitYn: 'N',
      },
      {
        busiId: 'ME',
        statId: 'ST-2',
        statNm: '둘째 충전소',
        addr: null,
        address: '인천',
        lat: null,
        lng: null,
        limitYn: 'Y',
      },
    ] as KecoInfoItem[]
    const statusItems = [
      { busiId: 'ME', statId: 'ST-1', chgerId: '01', stat: '2', statUpdDt: null },
      { busiId: 'ME', statId: 'ST-2', chgerId: '02', stat: '3', statUpdDt: null },
    ] as KecoStatusItem[]
    const provider: jest.Mocked<IKecoProvider> = {
      fetchInfoPage: jest
        .fn()
        .mockResolvedValueOnce(page(1, 2, [infoItems[0]]))
        .mockResolvedValueOnce(page(2, 2, [infoItems[1]])),
      fetchStatusPage: jest
        .fn()
        .mockResolvedValueOnce(page(1, 2, [statusItems[0]]))
        .mockResolvedValueOnce(page(2, 2, [statusItems[1]])),
    }
    const snapshotStore = store()

    await new RefreshCoordinator(provider, snapshotStore).refresh({
      queryKey: 'keco:11',
      source: 'keco',
      zcode: '11',
      periodMinutes: 7,
      ttlMs: 900_000,
    })

    expect(provider.fetchInfoPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageNo: 2, zcode: '11' }))
    expect(provider.fetchStatusPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageNo: 2, period: 7, zcode: '11' }),
    )
    expect(snapshotStore.writeQuerySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: 'keco:11',
        source: 'keco',
        stations: [
          expect.objectContaining({ stationId: 'ST-1', name: '첫 충전소', location: { lat: 37.5, lng: 127 } }),
          expect.objectContaining({ stationId: 'ST-2', address: '인천', access: 'RESTRICTED' }),
        ],
        chargers: [
          expect.objectContaining({ stationId: 'ST-1', chargerId: '01', rawStatus: '2' }),
          expect.objectContaining({ stationId: 'ST-2', chargerId: '02', rawStatus: '3' }),
        ],
      }),
    )
  })

  it('다중 region payload를 identity로 dedupe한 뒤 snapshot을 한 번만 atomic write한다', async () => {
    const duplicatedInfo = {
      busiId: 'ME',
      statId: 'ST-1',
      statNm: '경계 충전소',
      addr: '서울 경기 경계',
      lat: 37.5,
      lng: 126.8,
      limitYn: 'N',
    } as KecoInfoItem
    const duplicatedStatus = {
      busiId: 'ME',
      statId: 'ST-1',
      chgerId: '01',
      stat: '2',
      statUpdDt: null,
    } as KecoStatusItem
    const provider: jest.Mocked<IKecoProvider> = {
      fetchInfoPage: jest.fn().mockResolvedValue(page(1, 1, [duplicatedInfo])),
      fetchStatusPage: jest.fn().mockResolvedValue(page(1, 1, [duplicatedStatus])),
    }
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
    expect(provider.fetchInfoPage).toHaveBeenNthCalledWith(1, expect.objectContaining({ zcode: '11' }))
    expect(provider.fetchInfoPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ zcode: '41' }))
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
    const provider: jest.Mocked<IKecoProvider> = {
      fetchInfoPage: jest.fn().mockResolvedValue(page(1, 10, [])),
      fetchStatusPage: jest.fn().mockResolvedValue(page(1, 10, [])),
    }

    await new RefreshCoordinator(provider, store()).refresh({
      queryKey: 'keco:empty',
      source: 'keco',
      ttlMs: 900_000,
      nationwide: true,
    })

    expect(provider.fetchInfoPage).toHaveBeenCalledTimes(1)
    expect(provider.fetchStatusPage).toHaveBeenCalledTimes(1)
  })

  it('retryable failure는 재시도하고 non-retryable failure는 즉시 전파한다', async () => {
    const retryable = new KecoProviderError('timeout', {
      failureKind: 'TIMEOUT',
      retryable: true,
    })
    const retryProvider: jest.Mocked<IKecoProvider> = {
      fetchInfoPage: jest.fn().mockRejectedValueOnce(retryable).mockResolvedValue(page(1, 0, [])),
      fetchStatusPage: jest.fn().mockResolvedValue(page(1, 0, [])),
    }

    await new RefreshCoordinator(retryProvider, store()).refresh({
      queryKey: 'keco:retry',
      source: 'keco',
      ttlMs: 900_000,
      maxRetries: 1,
      nationwide: true,
    })
    expect(retryProvider.fetchInfoPage).toHaveBeenCalledTimes(2)

    const hardFailure = new KecoProviderError('auth', {
      failureKind: 'AUTHENTICATION',
      retryable: false,
    })
    const hardProvider: jest.Mocked<IKecoProvider> = {
      fetchInfoPage: jest.fn().mockRejectedValue(hardFailure),
      fetchStatusPage: jest.fn(),
    }

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
