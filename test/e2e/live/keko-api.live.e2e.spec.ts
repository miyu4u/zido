import 'dotenv/config'
import { KecoProvider } from 'zido/charger-providers'

/** KECO OpenAPI에 요청할 `.env` service key입니다. */
const serviceKey = process.env.KECO_SERVICE_KEY

if (!serviceKey) {
  describe('KECO live API configuration', () => {
    it.skip('KECO_SERVICE_KEY가 설정된 경우에만 실제 API를 호출한다', () => undefined)
  })
}

if (serviceKey) {
  describe('KECO live API', () => {
    /** `.env` credential가 유효한 실제 KECO endpoint를 호출하는 provider입니다. */
    const provider = new KecoProvider({ serviceKey })

    it('충전기 상태 page를 반환한다', async () => {
      const page = await provider.fetchStatusPage({
        pageNo: 1,
        numOfRows: 1,
      })

      expect(page.resultCode).toMatch(/^(00|03)$/)
      expect(page.pageNo).toBe(1)
      expect(page.numOfRows).toBe(1)
      expect(page.items).toEqual(expect.any(Array))
    })
  })
}
