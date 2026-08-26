import 'dotenv/config'
import { GoogleVendor } from '../../../libs/map-providers/src/google/google.vendor'
import { KakaoVendor } from '../../../libs/map-providers/src/kakao/kakao.vendor'
import { NaverVendor } from '../../../libs/map-providers/src/naver/naver.vendor'

/** `.env`에서 읽은 Kakao REST API key입니다. */
const kakaoRestKey = process.env.KAKAO_REST_KEY

/** `.env`에서 읽은 Naver application client ID입니다. */
const naverClientId = process.env.NAVER_CLIENT_ID

/** `.env`에서 읽은 Naver application client secret입니다. */
const naverClientSecret = process.env.NAVER_CLIENT_SECRET

/** `.env`에서 읽은 Google Maps API key입니다. */
const googleApiKey = process.env.GOOGLE_API_KEY

if (!kakaoRestKey && !(naverClientId && naverClientSecret) && !googleApiKey) {
  describe('map provider live API configuration', () => {
    it.skip('API key가 설정된 provider만 실제 API를 호출한다', () => undefined)
  })
}

if (kakaoRestKey) {
  describe('Kakao live provider', () => {
    /** `.env` credential를 사용해 Kakao Local API를 호출하는 provider입니다. */
    const provider = new KakaoVendor({ restKey: kakaoRestKey })

    it('장소 검색과 geocode 응답을 반환한다', async () => {
      const place = await provider.resolve('서울역 스타벅스')
      const geo = await provider.geocode('서울특별시 중구 한강대로 405')

      expect(place).toBeDefined()
      expect(geo).toBeDefined()
    })
  })
}

if (naverClientId && naverClientSecret) {
  describe('Naver live provider', () => {
    /** `.env` credential를 사용해 Naver Maps API를 호출하는 provider입니다. */
    const provider = new NaverVendor({
      clientId: naverClientId,
      clientSecret: naverClientSecret,
    })

    it('장소 검색과 geocode 응답을 반환한다', async () => {
      const place = await provider.resolve('서울역 스타벅스')
      const geo = await provider.geocode('서울특별시 중구 한강대로 405')

      expect(place).toBeDefined()
      expect(geo).toBeDefined()
    })
  })
}

if (googleApiKey) {
  describe('Google live provider', () => {
    /** `.env` credential를 사용해 Google Maps API를 호출하는 provider입니다. */
    const provider = new GoogleVendor({ apiKey: googleApiKey })

    it('장소 검색과 geocode 응답을 반환한다', async () => {
      const place = await provider.resolve('Seoul Station Starbucks')
      const geo = await provider.geocode('405 Hangang-daero, Jung-gu, Seoul')

      expect(place).toBeDefined()
      expect(geo).toBeDefined()
    })
  })
}
