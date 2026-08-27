import type { IKecoProvider } from 'zido/charger-providers'
import type { ChargerSnapshotStore } from 'zido/charger-storage'
import {
  CollectionScopeInputSchema,
  CollectionScopeMetadataSchema,
  DeterministicLocalBoundaryResolver,
} from './collection-scope'
import { ChargerService } from './charger-service'
import { RefreshCoordinator } from './refresh-coordinator'

/**
 * Scope 안전성 테스트에서 provider 호출 여부만 관측하는 fake다.
 */
function provider(): jest.Mocked<IKecoProvider> {
  const empty = { resultCode: '00', resultMsg: 'OK', pageNo: 1, numOfRows: 9999, totalCount: 0, items: [] }
  return {
    fetchInfoPage: jest.fn().mockResolvedValue(empty),
    fetchStatusPage: jest.fn().mockResolvedValue(empty),
  } as unknown as jest.Mocked<IKecoProvider>
}

/**
 * Scope 판정 전에 provider가 호출되는지 확인하는 in-memory store fake다.
 */
function store(
  overrides: Partial<Record<keyof ChargerSnapshotStore, jest.Mock>> = {},
): jest.Mocked<ChargerSnapshotStore> {
  return {
    readQuerySnapshot: jest.fn().mockResolvedValue(null),
    writeQuerySnapshot: jest.fn(),
    upsertStationInfo: jest.fn(),
    upsertChargerStatus: jest.fn(),
    findStation: jest.fn(),
    findChargers: jest.fn(),
    getQueryCacheMetadata: jest.fn(),
    close: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ChargerSnapshotStore>
}

describe('collection scope contract', () => {
  it('mode별 invalid field 조합을 public Zod schema에서 거부한다', () => {
    expect(CollectionScopeInputSchema.safeParse({ mode: 'AUTO', regionCodes: ['11'] }).success).toBe(false)
    expect(CollectionScopeInputSchema.safeParse({ mode: 'REGIONS', regionCodes: [] }).success).toBe(false)
    expect(CollectionScopeInputSchema.safeParse({ mode: 'REGIONS', regionCodes: ['99'] }).success).toBe(false)
    expect(CollectionScopeInputSchema.safeParse({ mode: 'NATIONWIDE' }).success).toBe(false)
    expect(
      CollectionScopeInputSchema.safeParse({ mode: 'NATIONWIDE', acknowledgeNationwide: true }).success,
    ).toBe(true)
    const metadataBase = {
      scopeSource: 'NATIONWIDE',
      collectionTriggered: false,
      provenance: { version: 'test', source: 'fixture', effectiveDate: '2026-08-01' },
    }
    expect(
      CollectionScopeMetadataSchema.safeParse({
        ...metadataBase,
        mode: 'NATIONWIDE',
        coverage: 'PARTIAL',
        regionCodes: [],
      }).success,
    ).toBe(false)
    expect(
      CollectionScopeMetadataSchema.safeParse({
        ...metadataBase,
        mode: 'REGIONS',
        scopeSource: 'REGIONS',
        coverage: 'PARTIAL',
        regionCodes: ['99'],
      }).success,
    ).toBe(false)
    expect(
      CollectionScopeMetadataSchema.safeParse({
        ...metadataBase,
        mode: 'NATIONWIDE',
        coverage: 'COMPLETE',
        regionCodes: ['11'],
      }).success,
    ).toBe(false)
  })

  it('서울 내부 원과 서울·경기 경계 원을 sorted unique region set으로 판정한다', async () => {
    const resolver = new DeterministicLocalBoundaryResolver()
    expect(await resolver.resolveScope({ lat: 37.556, lng: 126.972, radiusM: 3_000 })).toMatchObject({
      coverage: 'COMPLETE',
      regionCodes: ['11'],
      provenance: expect.objectContaining({ version: expect.any(String), source: expect.any(String) }),
    })
    expect(await resolver.resolveScope({ lat: 37.55, lng: 126.79, radiusM: 5_000 })).toMatchObject({
      coverage: 'COMPLETE',
      regionCodes: ['11', '41'],
    })
  })

  it('지원 경계 밖 AUTO는 provider 호출 전 COLLECTION_SCOPE_REQUIRED로 종료한다', async () => {
    const snapshotStore = store()
    const chargerProvider = provider()
    const service = new ChargerService(
      snapshotStore,
      new RefreshCoordinator(chargerProvider, snapshotStore),
    )

    await expect(service.searchNearby({ lat: 35.1796, lng: 129.0756, radiusM: 3_000 })).rejects.toMatchObject({
      code: 'COLLECTION_SCOPE_REQUIRED',
      status: 409,
    })
    expect(chargerProvider.fetchInfoPage).not.toHaveBeenCalled()
    expect(chargerProvider.fetchStatusPage).not.toHaveBeenCalled()
  })

  it('boundary resolver exception도 AUTO에서 fail-closed structured error로 변환한다', async () => {
    const snapshotStore = store()
    const chargerProvider = provider()
    const failingResolver = {
      resolveScope: jest.fn().mockRejectedValue(new Error('corrupt boundary fixture')),
    }
    const service = new ChargerService(
      snapshotStore,
      new RefreshCoordinator(chargerProvider, snapshotStore),
      failingResolver,
    )

    await expect(
      service.searchNearby({ lat: 37.556, lng: 126.972, radiusM: 3_000 }),
    ).rejects.toMatchObject({
      code: 'COLLECTION_SCOPE_REQUIRED',
      status: 409,
      scope: expect.objectContaining({ unresolvedReason: 'BOUNDARY_RESOLUTION_FAILED' }),
    })
    expect(chargerProvider.fetchInfoPage).not.toHaveBeenCalled()
  })

  it.each([
    { allow: false, acknowledge: false, code: 'INVALID_ARGUMENT' },
    { allow: true, acknowledge: false, code: 'INVALID_ARGUMENT' },
    { allow: false, acknowledge: true, code: 'NATIONWIDE_NOT_ALLOWED' },
  ])(
    'nationwide allow=$allow acknowledgement=$acknowledge 조합은 provider 호출 전에 거부한다',
    async ({ allow, acknowledge, code }) => {
      const snapshotStore = store()
      const chargerProvider = provider()
      const service = new ChargerService(
        snapshotStore,
        new RefreshCoordinator(chargerProvider, snapshotStore),
        new DeterministicLocalBoundaryResolver(),
        allow,
      )
      await expect(
        service.searchNearby({
          lat: 37.556,
          lng: 126.972,
          scope: { mode: 'NATIONWIDE', acknowledgeNationwide: acknowledge } as never,
        }),
      ).rejects.toMatchObject({ code })
      expect(chargerProvider.fetchInfoPage).not.toHaveBeenCalled()
      expect(chargerProvider.fetchStatusPage).not.toHaveBeenCalled()
    },
  )

  it('public getSnapshot direct call도 nationwide acknowledgement와 운영 allow를 우회하지 못한다', async () => {
    const snapshotStore = store()
    const chargerProvider = provider()
    const service = new ChargerService(snapshotStore, new RefreshCoordinator(chargerProvider, snapshotStore))

    await expect(
      service.getSnapshot('direct-nationwide', {
        ttlMs: 300_000,
        source: 'keco',
        nationwide: true,
      }),
    ).rejects.toMatchObject({ code: 'NATIONWIDE_NOT_ALLOWED', status: 403 })
    expect(snapshotStore.readQuerySnapshot).not.toHaveBeenCalled()
    expect(chargerProvider.fetchInfoPage).not.toHaveBeenCalled()
  })

  it('동일 region scope의 다른 좌표 검색은 첫 snapshot refresh를 재사용한다', async () => {
    const bundle = {
      queryKey: 'scope',
      source: 'keco' as const,
      observedAt: '2026-08-27T00:00:00.000Z',
      isStale: false,
      itemCount: 0,
      stations: [],
      chargers: [],
    }
    const readQuerySnapshot = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(bundle)
    const snapshotStore = store({ readQuerySnapshot })
    const chargerProvider = provider()
    const service = new ChargerService(
      snapshotStore,
      new RefreshCoordinator(chargerProvider, snapshotStore),
    )

    await service.searchNearby({ lat: 37.556, lng: 126.972, radiusM: 1_000 })
    await service.searchNearby({ lat: 37.57, lng: 126.99, radiusM: 2_000 })

    expect(chargerProvider.fetchInfoPage).toHaveBeenCalledTimes(1)
    expect(chargerProvider.fetchStatusPage).toHaveBeenCalledTimes(1)
    expect(snapshotStore.writeQuerySnapshot).toHaveBeenCalledTimes(1)
    expect(snapshotStore.writeQuerySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          provenance: {
            version: '2026.08',
            source: 'keco-boundary-fixture',
            effectiveDate: '2026-08-01',
          },
        }),
      }),
    )
    const observedKeys = readQuerySnapshot.mock.calls.map(([queryKey]) => queryKey)
    expect(new Set(observedKeys).size).toBe(1)
    expect(observedKeys[0]).not.toContain('"lat"')
    expect(observedKeys[0]).not.toContain('"radiusM"')
  })

  it('region set과 boundary version premise가 달라지면 별도 cache identity를 사용한다', async () => {
    const bundle = {
      queryKey: 'scope',
      source: 'keco' as const,
      observedAt: '2026-08-27T00:00:00.000Z',
      isStale: false,
      itemCount: 0,
      stations: [],
      chargers: [],
    }
    const readQuerySnapshot = jest.fn().mockResolvedValue(bundle)
    const snapshotStore = store({ readQuerySnapshot })
    const serviceV1 = new ChargerService(
      snapshotStore,
      new RefreshCoordinator(provider(), snapshotStore),
    )
    const versionedResolver = {
      resolveScope: jest.fn().mockResolvedValue({
        coverage: 'COMPLETE',
        regionCodes: ['11', '41'],
        provenance: {
          version: '2026.09',
          source: 'next-fixture',
          effectiveDate: '2026-09-01',
        },
      }),
    }
    const serviceV2 = new ChargerService(
      snapshotStore,
      new RefreshCoordinator(provider(), snapshotStore),
      versionedResolver,
    )

    await serviceV1.searchNearby({
      lat: 37.55,
      lng: 126.79,
      radiusM: 5_000,
      scope: { mode: 'REGIONS', regionCodes: ['11'] },
    })
    await serviceV2.searchNearby({
      lat: 37.55,
      lng: 126.79,
      radiusM: 5_000,
      scope: { mode: 'REGIONS', regionCodes: ['11', '41'] },
    })

    const observedKeys = readQuerySnapshot.mock.calls.map(([queryKey]) => queryKey)
    expect(new Set(observedKeys).size).toBe(2)
    expect(observedKeys[0]).toContain('"scope":"11"')
    expect(observedKeys[1]).toContain('"scope":"11,41"')
    expect(observedKeys[0]).toContain('"periodMinutes":5')
    expect(observedKeys[1]).toContain('"periodMinutes":5')
    expect(observedKeys[0]).toContain('"boundaryVersion":"2026.08"')
    expect(observedKeys[1]).toContain('"boundaryVersion":"2026.09"')
    expect(observedKeys[0]).toContain('"boundarySource":"keco-boundary-fixture"')
    expect(observedKeys[1]).toContain('"boundarySource":"next-fixture"')
    expect(observedKeys[1]).toContain('"boundaryEffectiveDate":"2026-09-01"')
  })

  it('검색 원보다 작은 explicit REGIONS는 선택 지역만 수집하고 PARTIAL을 표시한다', async () => {
    const bundle = {
      queryKey: 'partial',
      source: 'keco' as const,
      observedAt: '2026-08-27T00:00:00.000Z',
      isStale: false,
      itemCount: 0,
      stations: [],
      chargers: [],
    }
    const snapshotStore = store({
      readQuerySnapshot: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(bundle),
    })
    const chargerProvider = provider()
    const service = new ChargerService(
      snapshotStore,
      new RefreshCoordinator(chargerProvider, snapshotStore),
    )

    const result = await service.searchNearby({
      lat: 37.55,
      lng: 126.79,
      radiusM: 5_000,
      scope: { mode: 'REGIONS', regionCodes: ['11'] },
    })

    expect(result.scope).toMatchObject({
      coverage: 'PARTIAL',
      regionCodes: ['11'],
      candidateRegions: ['11', '41'],
    })
    expect(chargerProvider.fetchInfoPage).toHaveBeenCalledWith(expect.objectContaining({ zcode: '11' }))
    expect(chargerProvider.fetchInfoPage).not.toHaveBeenCalledWith(expect.objectContaining({ zcode: '41' }))
  })

  it('운영 allow와 호출 acknowledgement가 모두 true일 때만 explicit nationwide fetch를 시작한다', async () => {
    const bundle = {
      queryKey: 'nationwide',
      source: 'keco' as const,
      observedAt: '2026-08-27T00:00:00.000Z',
      isStale: false,
      itemCount: 0,
      stations: [],
      chargers: [],
    }
    const snapshotStore = store({
      readQuerySnapshot: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(bundle),
    })
    const chargerProvider = provider()
    const service = new ChargerService(
      snapshotStore,
      new RefreshCoordinator(chargerProvider, snapshotStore),
      new DeterministicLocalBoundaryResolver(),
      true,
    )

    await service.searchNearby({
      lat: 37.556,
      lng: 126.972,
      scope: { mode: 'NATIONWIDE', acknowledgeNationwide: true },
    })

    expect(chargerProvider.fetchInfoPage).toHaveBeenCalledWith(expect.objectContaining({ nationwide: true }))
    expect(chargerProvider.fetchStatusPage).toHaveBeenCalledWith(expect.objectContaining({ nationwide: true }))
  })
})
