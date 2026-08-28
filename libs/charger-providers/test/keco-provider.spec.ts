import {
  ChargerInfoPageSchema,
  ChargerInfoQuerySchema,
  ChargerProviderCapabilitiesSchema,
  ChargerStatusPageSchema,
} from '../src'

describe('ChargerProviderContract', () => {
  it('page와 cursor pagination 입력을 구분한다', () => {
    expect(
      ChargerInfoQuerySchema.parse({
        scope: { type: 'NATIONWIDE', countryCode: 'KR' },
        pagination: { type: 'PAGE', page: 1, pageSize: 100 },
      }),
    ).toMatchObject({ pagination: { type: 'PAGE', page: 1 } })

    expect(
      ChargerInfoQuerySchema.parse({
        scope: { type: 'RADIUS', center: { lat: 37.5, lng: 127 }, radiusMeters: 1_000 },
        pagination: { type: 'CURSOR', pageSize: 20 },
      }),
    ).toMatchObject({ pagination: { type: 'CURSOR', pageSize: 20 } })
  })

  it('provider가 지원 범위와 운영 한도를 선언한다', () => {
    const capabilities = ChargerProviderCapabilitiesSchema.parse({
      scopes: ['REGION'],
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
    })

    expect(capabilities.status).toBe('DYNAMIC')
    expect(capabilities.limits.pageSize.max).toBe(9_999)
  })

  it('공통 정보 page에서 잘못된 좌표를 거부한다', () => {
    expect(() =>
      ChargerInfoPageSchema.parse({
        providerId: 'sample',
        page: 1,
        pageSize: 1,
        totalCount: 1,
        nextCursor: null,
        hasNext: false,
        observedAt: new Date().toISOString(),
        providerMetadata: {},
        items: [
          {
            providerId: 'sample',
            operatorId: null,
            operatorName: null,
            stationId: 'station-1',
            chargerId: null,
            name: null,
            address: null,
            addressDetail: null,
            location: { lat: 91, lng: 127 },
            access: 'UNKNOWN',
            operatingHours: null,
            connectors: [],
          },
        ],
      }),
    ).toThrow()
  })

  it('상태 page가 connector 집계 상태도 표현한다', () => {
    const page = ChargerStatusPageSchema.parse({
      providerId: 'sample',
      page: null,
      pageSize: 1,
      totalCount: null,
      nextCursor: 'next-page',
      hasNext: true,
      observedAt: new Date().toISOString(),
      providerMetadata: {},
      items: [
        {
          providerId: 'sample',
          operatorId: 'operator-1',
          stationId: 'station-1',
          chargerId: null,
          status: 'AVAILABLE',
          rawStatus: 'available',
          statusUpdatedAt: null,
          observedAt: new Date().toISOString(),
          availableCount: 2,
          outOfServiceCount: 0,
          totalCount: 4,
        },
      ],
    })

    expect(page.items[0]).toMatchObject({ chargerId: null, availableCount: 2, totalCount: 4 })
  })
})
