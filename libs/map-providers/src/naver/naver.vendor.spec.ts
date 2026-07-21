import { ProviderException } from 'zido/configuration'
import type {
    NaverGeocodeResponse,
    NaverLocalSearchItem,
    NaverLocalSearchResponse,
} from './typed'
import { NaverVendor } from './naver.vendor'

const localItem = (overrides: Partial<NaverLocalSearchItem> = {}): NaverLocalSearchItem => ({
    title: '<b>네이버 장소</b>',
    link: 'https://example.com',
    category: '카페',
    description: '',
    telephone: '02-0000-0000',
    address: '서울시 중구',
    roadAddress: '서울시 중구 세종대로',
    mapx: '1270010000',
    mapy: '375010000',
    ...overrides,
})

describe('NaverVendor', () => {
    it('인증 정보가 없으면 명시적인 ProviderException을 발생시킨다', () => {
        expect(() => new NaverVendor({ clientId: '', clientSecret: '' })).toThrow(ProviderException)
        expect(() => new NaverVendor({ clientId: '', clientSecret: '' })).toThrow(
            'Naver Client ID and Secret are required',
        )
    })

    it('로컬 검색 요청을 구성하고 HTML과 좌표를 정규화한다', async () => {
        const provider = new NaverVendor({ clientId: 'client', clientSecret: 'secret' })
        const get = jest.spyOn(provider.http, 'get').mockResolvedValue({
            data: {
                items: [localItem()],
                lastBuildDate: '',
                total: 1,
                start: 1,
                display: 1,
            } satisfies NaverLocalSearchResponse,
        })

        const result = await provider.resolve('카페')

        expect(get).toHaveBeenCalledWith('/local.json', { params: { query: '카페', display: 1, start: 1 } })
        expect(result).toMatchObject({
            name: '네이버 장소',
            lat: 37.501,
            lng: 127.001,
            provider: 'naver',
        })
    })

    it('검색 결과가 없거나 좌표가 유효하지 않으면 null을 반환한다', async () => {
        const provider = new NaverVendor({ clientId: 'client', clientSecret: 'secret' })
        const get = jest.spyOn(provider.http, 'get')

        get.mockResolvedValueOnce({
            data: { items: [], lastBuildDate: '', total: 0, start: 1, display: 1 },
        })
        await expect(provider.resolve('없는 장소')).resolves.toBeNull()

        get.mockResolvedValueOnce({
            data: {
                items: [localItem({ mapx: 'bad' })],
                lastBuildDate: '',
                total: 1,
                start: 1,
                display: 1,
            },
        })
        await expect(provider.resolve('잘못된 장소')).resolves.toBeNull()
    })

    it('주변 검색 요청을 구성하고 유효한 항목만 반환한다', async () => {
        const provider = new NaverVendor({ clientId: 'client', clientSecret: 'secret' })
        const get = jest.spyOn(provider.http, 'get').mockResolvedValue({
            data: {
                items: [localItem(), localItem({ mapy: 'bad' })],
                lastBuildDate: '',
                total: 2,
                start: 1,
                display: 5,
            } satisfies NaverLocalSearchResponse,
        })

        const result = await provider.searchNearby({ lat: 37.5, lng: 127 }, '식당', 500)

        expect(get).toHaveBeenCalledWith('/local.json', { params: { query: '식당', display: 5, start: 1 } })
        expect(result).toHaveLength(1)
        expect(result[0]?.name).toBe('네이버 장소')
    })

    it('지오코딩 요청을 구성하고 첫 주소를 좌표로 반환한다', async () => {
        const provider = new NaverVendor({ clientId: 'client', clientSecret: 'secret' })
        const address = { roadAddress: '서울시 중구 세종대로', x: '127.01', y: '37.51' }
        const geocodeHttp = (provider as unknown as { geocodeHttp: { get: jest.Mock } }).geocodeHttp
        const get = jest.spyOn(geocodeHttp, 'get').mockResolvedValue({
            data: { status: 'OK', addresses: [address] } satisfies NaverGeocodeResponse,
        })

        const result = await provider.geocode('서울시 중구')

        expect(get).toHaveBeenCalledWith('/geocode', { params: { query: '서울시 중구' } })
        expect(result).toEqual({ lat: 37.51, lng: 127.01, provider: 'naver', raw: address })
    })

    it('지오코딩 비정상 상태와 HTTP 실패를 ProviderException으로 변환한다', async () => {
        const provider = new NaverVendor({ clientId: 'client', clientSecret: 'secret' })
        const geocodeHttp = (provider as unknown as { geocodeHttp: { get: jest.Mock } }).geocodeHttp
        jest.spyOn(geocodeHttp, 'get').mockResolvedValue({
            data: { status: 'REQUEST_DENIED', errorMessage: 'denied', addresses: [] } satisfies NaverGeocodeResponse,
        })

        await expect(provider.geocode('주소')).rejects.toMatchObject({
            provider: 'naver',
            code: 'REQUEST_FAILED',
            message: 'Failed to geocode address: Geocode failed: denied',
        })
    })
})
