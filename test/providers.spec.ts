import 'dotenv/config'
import { GoogleVendor } from '../libs/map-providers/src/google/google.vendor'
import { KakaoVendor } from '../libs/map-providers/src/kakao/kakao.vendor'
import { NaverVendor } from '../libs/map-providers/src/naver/naver.vendor'

const liveProviderTestsEnabled = process.env.RUN_LIVE_PROVIDER_TESTS === '1'

if (
    !liveProviderTestsEnabled ||
    (!process.env.KAKAO_REST_KEY && !process.env.NAVER_CLIENT_ID && !process.env.GOOGLE_API_KEY)
) {
    describe('live provider opt-in', () => {
        it.skip('API key가 설정된 provider만 실행한다', () => undefined)
    })
}

if (liveProviderTestsEnabled && process.env.KAKAO_REST_KEY) {
    describe('Kakao live provider', () => {
    const provider = new KakaoVendor({ restKey: process.env.KAKAO_REST_KEY || '' })

    it('장소 검색과 geocode 응답을 반환한다', async () => {
        const place = await provider.resolve('서울역 스타벅스')
        const geo = await provider.geocode('서울특별시 중구 한강대로 405')
        expect(place).toBeDefined()
        expect(geo).toBeDefined()
    })
    })
}

if (liveProviderTestsEnabled && process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    describe('Naver live provider', () => {
    const provider = new NaverVendor({
        clientId: process.env.NAVER_CLIENT_ID || '',
        clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    })

    it('장소 검색과 geocode 응답을 반환한다', async () => {
        const place = await provider.resolve('서울역 스타벅스')
        const geo = await provider.geocode('서울특별시 중구 한강대로 405')
        expect(place).toBeDefined()
        expect(geo).toBeDefined()
    })
    })
}

if (liveProviderTestsEnabled && process.env.GOOGLE_API_KEY) {
    describe('Google live provider', () => {
    const provider = new GoogleVendor({ apiKey: process.env.GOOGLE_API_KEY || '' })

    it('장소 검색과 geocode 응답을 반환한다', async () => {
        const place = await provider.resolve('Seoul Station Starbucks')
        const geo = await provider.geocode('405 Hangang-daero, Jung-gu, Seoul')
        expect(place).toBeDefined()
        expect(geo).toBeDefined()
    })
    })
}
