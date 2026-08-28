import 'dotenv/config'
import { config } from 'zido/common'
import {
  ChargerInfoPageSchema,
  ChargerStatusPageSchema,
  KEcoAPIService,
  KEcoService,
  type ChargerProviderScope,
} from 'zido/charger-providers'

/** KECO OpenAPI에 요청할 `.env` service key입니다. */
const serviceKey = config.charger.serviceKey

/** Live API가 지원하는 최소 page 크기입니다. */
const PAGE_SIZE = 10

/** 서울특별시 충전소를 조회하는 공통 provider 범위입니다. */
const SEOUL_SCOPE = {
  type: 'REGION',
  countryCode: 'KR',
  regionCode: '11',
} satisfies ChargerProviderScope

jest.setTimeout(Math.max(10_000, config.charger.timeoutMs + 5_000))

if (!serviceKey) {
  describe('KECO live API configuration', () => {
    it.skip('KECO_API_KEY가 설정된 경우에만 실제 API를 호출한다', () => undefined)
  })
}

if (serviceKey) {
  describe('KECO live API', () => {
    /** 실제 credential로 KECO transport와 provider adapter를 함께 검증합니다. */
    const provider = new KEcoService(
      new KEcoAPIService({
        serviceKey,
        endpoint: config.charger.endpoint,
        timeoutMs: config.charger.timeoutMs,
      }),
    )

    it('충전소 정보 응답을 공통 ChargerInfoPage 계약으로 반환한다', async () => {
      const page = ChargerInfoPageSchema.parse(
        await provider.fetchInfoPage({
          scope: SEOUL_SCOPE,
          pagination: { type: 'PAGE', page: 1, pageSize: PAGE_SIZE },
        }),
      )

      expect(page.providerId).toBe('keco')
      expect(page.providerMetadata['resultCode']).toMatch(/^(00|03)$/)
      expect(page.providerMetadata['resultMsg']).toEqual(expect.any(String))
      expect(page.page).toBe(1)
      expect(page.pageSize).toBe(PAGE_SIZE)
      expect(page.totalCount).not.toBeNull()
      expect(page.items.length).toBeLessThanOrEqual(PAGE_SIZE)
      expect(page.hasNext).toBe((page.page ?? 0) * page.pageSize < (page.totalCount ?? 0))
      expect(Number.isNaN(Date.parse(page.observedAt))).toBe(false)

      for (const item of page.items) {
        expect(item.providerId).toBe('keco')
        expect(item.stationId).toEqual(expect.stringMatching(/\S/))
        expect(item.chargerId).toEqual(expect.stringMatching(/\S/))

        if (item.location) {
          expect(item.location.lat).toBeGreaterThanOrEqual(-90)
          expect(item.location.lat).toBeLessThanOrEqual(90)
          expect(item.location.lng).toBeGreaterThanOrEqual(-180)
          expect(item.location.lng).toBeLessThanOrEqual(180)
        }

        for (const connector of item.connectors) {
          expect(connector.type).toMatch(/^KECO:/)
          expect(connector.count).toBe(1)
        }
      }
    })

    it('최근 충전기 상태를 공통 ChargerStatusPage 계약으로 반환한다', async () => {
      const page = ChargerStatusPageSchema.parse(
        await provider.fetchStatusPage({
          scope: SEOUL_SCOPE,
          pagination: { type: 'PAGE', page: 1, pageSize: PAGE_SIZE },
          updatedWithinMinutes: 10,
        }),
      )

      expect(page.providerId).toBe('keco')
      expect(page.providerMetadata['resultCode']).toMatch(/^(00|03)$/)
      expect(page.providerMetadata['resultMsg']).toEqual(expect.any(String))
      expect(page.page).toBe(1)
      expect(page.pageSize).toBe(PAGE_SIZE)
      expect(page.totalCount).not.toBeNull()
      expect(page.items.length).toBeLessThanOrEqual(PAGE_SIZE)
      expect(page.hasNext).toBe((page.page ?? 0) * page.pageSize < (page.totalCount ?? 0))
      expect(Number.isNaN(Date.parse(page.observedAt))).toBe(false)

      for (const item of page.items) {
        expect(item.providerId).toBe('keco')
        expect(item.stationId).toEqual(expect.stringMatching(/\S/))
        expect(item.chargerId).toEqual(expect.stringMatching(/\S/))
        expect(item.rawStatus).toEqual(expect.stringMatching(/^\d+$/))
        expect(item.totalCount).toBe(1)

        if (item.statusUpdatedAt) {
          expect(item.statusUpdatedAt).toMatch(/Z$/)
          expect(Number.isNaN(Date.parse(item.statusUpdatedAt))).toBe(false)
        }

        if (item.status === 'UNKNOWN') {
          expect(item.availableCount).toBeNull()
          expect(item.outOfServiceCount).toBeNull()
        } else {
          expect(item.availableCount).not.toBeNull()
          expect(item.outOfServiceCount).not.toBeNull()
        }
      }
    })
  })
}
