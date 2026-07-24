import axios from 'axios'
import { ProviderException } from 'zido/common'
import type {
    GoogleGeocodeResponse,
    GoogleNearbySearchResponse,
    GooglePlace,
    GoogleTextSearchResponse,
} from './typed'
import { GoogleVendor } from './google.vendor'

const place = (overrides: Partial<GooglePlace> = {}): GooglePlace => ({
    id: 'place-id',
    displayName: { text: 'Google 장소', languageCode: 'ko' },
    formattedAddress: '서울시 중구',
    location: { latitude: 37.501, longitude: 127.001 },
    ...overrides,
})

describe('GoogleVendor', () => {
    it('API key가 없으면 명시적인 ProviderException을 발생시킨다', () => {
        const createVendor = () => new GoogleVendor({ apiKey: '' })
        expect(createVendor).toThrow(ProviderException)
        expect(createVendor).toThrow('Google API key is required')
        try {
            createVendor()
        } catch (error) {
            expect(error).toMatchObject({
                provider: 'google',
                code: 'MISSING_API_KEY',
            })
        }
    })

    it('텍스트 검색 요청을 구성하고 장소를 공통 형식으로 변환한다', async () => {
        const provider = new GoogleVendor({ apiKey: 'test-key' })
        const post = jest.spyOn(provider.http, 'post').mockResolvedValue({
            data: { places: [place()] } satisfies GoogleTextSearchResponse,
        })

        const result = await provider.resolve('카페')

        expect(post).toHaveBeenCalledWith(
            '/places:searchText',
            { textQuery: '카페', maxResultCount: 1 },
            { headers: { 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location' } },
        )
        expect(result).toMatchObject({
            name: 'Google 장소',
            address: '서울시 중구',
            lat: 37.501,
            lng: 127.001,
            provider: 'google',
        })
    })

    it('장소가 없거나 위치가 없으면 null을 반환한다', async () => {
        const provider = new GoogleVendor({ apiKey: 'test-key' })
        const post = jest.spyOn(provider.http, 'post')

        post.mockResolvedValueOnce({ data: { places: [] } })
        await expect(provider.resolve('없는 장소')).resolves.toBeNull()

        post.mockResolvedValueOnce({ data: { places: [place({ location: undefined })] } })
        await expect(provider.resolve('잘못된 장소')).resolves.toBeNull()
    })

    it('키워드가 있는 주변 검색은 Text Search 요청과 반경 제한을 사용한다', async () => {
        const provider = new GoogleVendor({ apiKey: 'test-key' })
        const post = jest.spyOn(provider.http, 'post').mockResolvedValue({
            data: { places: [place(), place({ location: undefined })] } satisfies GoogleTextSearchResponse,
        })

        const result = await provider.searchNearby({ lat: 37.5, lng: 127 }, '식당', 100000)

        expect(post).toHaveBeenCalledWith(
            '/places:searchText',
            {
                textQuery: '식당',
                maxResultCount: 15,
                locationBias: {
                    circle: { center: { latitude: 37.5, longitude: 127 }, radius: 50000 },
                },
                rankPreference: 'DISTANCE',
            },
            { headers: { 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location' } },
        )
        expect(result).toHaveLength(1)
    })

    it('키워드가 없으면 Nearby Search 요청을 구성한다', async () => {
        const provider = new GoogleVendor({ apiKey: 'test-key' })
        const post = jest.spyOn(provider.http, 'post').mockResolvedValue({
            data: { places: [place()] } satisfies GoogleNearbySearchResponse,
        })

        await provider.searchNearby({ lat: 37.5, lng: 127 }, '', -10)

        expect(post).toHaveBeenCalledWith(
            '/places:searchNearby',
            {
                maxResultCount: 15,
                locationRestriction: {
                    circle: { center: { latitude: 37.5, longitude: 127 }, radius: 0 },
                },
                rankPreference: 'DISTANCE',
            },
            { headers: { 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location' } },
        )
    })

    it('지오코딩 성공, 빈 결과, 실패 상태를 각각 처리한다', async () => {
        const provider = new GoogleVendor({ apiKey: 'test-key' })
        const get = jest.spyOn(axios, 'get')
        const geocodeResult = {
            address_components: [],
            formatted_address: '서울시 중구',
            geometry: { location: { lat: 37.51, lng: 127.01 }, location_type: 'ROOFTOP' },
            place_id: 'geo-id',
            types: ['street_address'],
        }

        get.mockResolvedValueOnce({
            data: { status: 'OK', results: [geocodeResult] } satisfies GoogleGeocodeResponse,
        })
        await expect(provider.geocode('서울시 중구')).resolves.toEqual({
            lat: 37.51,
            lng: 127.01,
            provider: 'google',
            raw: geocodeResult,
        })

        get.mockResolvedValueOnce({ data: { status: 'ZERO_RESULTS', results: [] } })
        await expect(provider.geocode('없는 주소')).resolves.toBeNull()

        get.mockResolvedValueOnce({
            data: { status: 'REQUEST_DENIED', results: [], error_message: 'denied' },
        })
        await expect(provider.geocode('주소')).rejects.toMatchObject({
            provider: 'google',
            code: 'AUTHENTICATION_FAILED',
            message: 'Geocode failed: denied',
        })
    })

    it('HTTP 실패를 Google ProviderException으로 변환한다', async () => {
        const provider = new GoogleVendor({ apiKey: 'test-key' })
        jest.spyOn(provider.http, 'post').mockRejectedValue(new Error('network down'))

        await expect(provider.resolve('카페')).rejects.toMatchObject({
            provider: 'google',
            code: 'REQUEST_FAILED',
            message: 'Failed to resolve place: network down',
        })
    })

    it.each([
        { status: 401, expectedCode: 'AUTHENTICATION_FAILED', errorMsg: 'Unauthorized' },
        { status: 403, expectedCode: 'AUTHENTICATION_FAILED', errorMsg: 'Forbidden' },
        { status: 400, expectedCode: 'REQUEST_FAILED', errorMsg: 'Bad Request' },
        {
            status: 400,
            expectedCode: 'AUTHENTICATION_FAILED',
            errorMsg: 'API key not valid',
            details: [{ reason: 'API_KEY_INVALID' }],
        },
    ])(
        'Axios $status Rejection이 $expectedCode ProviderException으로 변환된다',
        async ({ status, expectedCode, errorMsg, details }) => {
        const provider = new GoogleVendor({ apiKey: 'test-key' })
            const mockError = Object.assign(new Error(errorMsg), {
                isAxiosError: true,
                response: {
                    status,
                    data: details ? { error: { details } } : undefined,
        },
})
            jest.spyOn(provider.http, 'post').mockRejectedValue(mockError)

        await expect(provider.resolve('카페')).rejects.toMatchObject({
            provider: 'google',
                code: expectedCode,
                message: `Failed to resolve place: ${errorMsg}`,
            })
        },
    )
})
