import { ProviderException } from 'zido/common'
import type {
    KakaoAddressSearchResponse,
    KakaoKeywordSearchResponse,
    KakaoPlaceDocument,
} from './typed'
import { KakaoVendor } from './kakao.vendor'

const placeDocument = (overrides: Partial<KakaoPlaceDocument> = {}): KakaoPlaceDocument => ({
    place_name: '카카오 장소',
    address_name: '서울시 중구',
    road_address_name: '서울시 중구 세종대로',
    x: '127.001',
    y: '37.501',
    ...overrides,
})

describe('KakaoVendor', () => {
    it('API key가 없으면 명시적인 ProviderException을 발생시킨다', () => {
        expect(() => new KakaoVendor({ restKey: '' })).toThrow(ProviderException)
        expect(() => new KakaoVendor({ restKey: '' })).toThrow('Kakao REST API key is required')
    })

    it('키워드 검색 요청을 구성하고 장소를 공통 형식으로 변환한다', async () => {
        const provider = new KakaoVendor({ restKey: 'test-key' })
        const get = jest.spyOn(provider.http, 'get').mockResolvedValue({
            data: {
                documents: [placeDocument()],
                meta: { total_count: 1, pageable_count: 1, is_end: true },
            } satisfies KakaoKeywordSearchResponse,
        })

        const result = await provider.resolve('카페')

        expect(get).toHaveBeenCalledWith('/search/keyword.json', {
            params: { query: '카페', size: 1 },
        })
        expect(result).toMatchObject({
            name: '카카오 장소',
            address: '서울시 중구',
            roadAddress: '서울시 중구 세종대로',
            lat: 37.501,
            lng: 127.001,
            provider: 'kakao',
        })
    })

    it('검색 결과가 없거나 좌표가 잘못되면 null을 반환한다', async () => {
        const provider = new KakaoVendor({ restKey: 'test-key' })
        const get = jest.spyOn(provider.http, 'get')

        get.mockResolvedValueOnce({
            data: { documents: [], meta: { total_count: 0, pageable_count: 0, is_end: true } },
        })
        await expect(provider.resolve('없는 장소')).resolves.toBeNull()

        get.mockResolvedValueOnce({
            data: {
                documents: [placeDocument({ x: 'not-a-number' })],
                meta: { total_count: 1, pageable_count: 1, is_end: true },
            },
        })
        await expect(provider.resolve('잘못된 장소')).resolves.toBeNull()
    })

    it('주변 검색 반경을 제한하고 유효한 장소만 반환한다', async () => {
        const provider = new KakaoVendor({ restKey: 'test-key' })
        const get = jest.spyOn(provider.http, 'get').mockResolvedValue({
            data: {
                documents: [placeDocument(), placeDocument({ x: 'bad' })],
                meta: { total_count: 2, pageable_count: 2, is_end: true },
            } satisfies KakaoKeywordSearchResponse,
        })

        const result = await provider.searchNearby({ lat: 37.5, lng: 127 }, '식당', 50000.6)

        expect(get).toHaveBeenCalledWith('/search/keyword.json', {
            params: {
                query: '식당',
                x: 127,
                y: 37.5,
                radius: 20000,
                size: 15,
                sort: 'distance',
            },
        })
        expect(result).toHaveLength(1)
        expect(result[0]?.provider).toBe('kakao')
    })

    it('주소 검색 요청을 구성하고 좌표를 반환한다', async () => {
        const provider = new KakaoVendor({ restKey: 'test-key' })
        const document = { address_name: '서울시 중구', x: '127.01', y: '37.51', address_type: 'ROAD' }
        const get = jest.spyOn(provider.http, 'get').mockResolvedValue({
            data: {
                documents: [document],
                meta: { total_count: 1, pageable_count: 1, is_end: true },
            } satisfies KakaoAddressSearchResponse,
        })

        const result = await provider.geocode('서울시 중구')

        expect(get).toHaveBeenCalledWith('/search/address.json', {
            params: { query: '서울시 중구', size: 1 },
        })
        expect(result).toEqual({ lat: 37.51, lng: 127.01, provider: 'kakao', raw: document })
    })

    it('HTTP 실패를 Kakao ProviderException으로 변환한다', async () => {
        const provider = new KakaoVendor({ restKey: 'test-key' })
        jest.spyOn(provider.http, 'get').mockRejectedValue('network down')

        await expect(provider.resolve('카페')).rejects.toMatchObject({
            provider: 'kakao',
            code: 'REQUEST_FAILED',
            message: 'Failed to resolve place: network down',
        })
    })
})
