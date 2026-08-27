import 'dotenv/config'
import { config } from 'zido/common'
import { KecoAPIService, KecoService } from 'zido/charger-providers'

/** KECO OpenAPI에 요청할 `.env` service key입니다. */
const serviceKey = config.charger.serviceKey

if (!serviceKey) {
  describe('KECO live API configuration', () => {
    it.skip('KECO_API_KEY가 설정된 경우에만 실제 API를 호출한다', () => undefined)
  })
}

if (serviceKey) {
  describe('KECO live API', () => {
    /** `.env` credential가 유효한 실제 KECO endpoint를 호출하는 provider입니다. */
    const provider = new KecoService(
      new KecoAPIService({
        serviceKey,
        endpoint: config.charger.endpoint,
        timeoutMs: config.charger.timeoutMs,
      }),
    )

    it('충전기 상태 page를 공식 pagination 계약으로 반환한다', async () => {
      /** 서울 지역에서 최근 10분간 갱신된 충전기 상태 응답입니다. */
      const page = await provider.fetchStatusPage({
        pageNo: 1,
        numOfRows: 10,
        period: 10,
        zcode: '11',
      })

      expect(page.resultCode).toMatch(/^(00|03)$/)
      expect(page.resultMsg).toEqual(expect.stringMatching(/\S/))
      expect(page.pageNo).toBe(1)
      expect(page.numOfRows).toBe(10)
      expect(Number.isSafeInteger(page.totalCount)).toBe(true)
      expect(page.totalCount).toBeGreaterThanOrEqual(0)
      expect(page.items).toEqual(expect.any(Array))
      expect(page.items.length).toBeLessThanOrEqual(10)

      /** 조회 기간에 갱신된 데이터가 있을 때 확인할 실제 충전기 상태입니다. */
      const [item] = page.items

      if (item) {
        expect(item.statId).toEqual(expect.stringMatching(/\S/))
        expect(item.chgerId).toEqual(expect.stringMatching(/\S/))
        expect(item.stat).toEqual(expect.stringMatching(/^\d+$/))
        expect(item.statUpdDt).toEqual(expect.stringMatching(/^\d{14}$/))
      }
    })

    it('충전소 정보 page를 공식 pagination 계약으로 반환한다', async () => {
      /** 서울 지역 충전소의 위치와 운영 정보를 포함한 응답입니다. */
      const page = await provider.fetchInfoPage({
        pageNo: 1,
        numOfRows: 10,
        zcode: '11',
      })

      expect(page.resultCode).toBe('00')
      expect(page.resultMsg).toEqual(expect.stringMatching(/\S/))
      expect(page.pageNo).toBe(1)
      expect(page.numOfRows).toBe(10)
      expect(Number.isSafeInteger(page.totalCount)).toBe(true)
      expect(page.totalCount).toBeGreaterThan(0)
      expect(page.items).toEqual(expect.any(Array))
      expect(page.items.length).toBeGreaterThan(0)
      expect(page.items.length).toBeLessThanOrEqual(10)

      /** 조회된 데이터가 있을 때 확인할 실제 충전소 식별자와 위치 정보입니다. */
      const [item] = page.items

      if (item) {
        expect(item.statId).toEqual(expect.stringMatching(/\S/))
        expect(item.chgerId).toEqual(expect.stringMatching(/\S/))
        expect(item.statNm).toEqual(expect.stringMatching(/\S/))
        expect(item.addr).toEqual(expect.stringMatching(/\S/))
        expect(item.lat).not.toBeNull()
        expect(item.lng).not.toBeNull()
        expect(Number.isFinite(Number(item.lat))).toBe(true)
        expect(Number.isFinite(Number(item.lng))).toBe(true)
      }
    })
  })
}
