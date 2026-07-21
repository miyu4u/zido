import { PlaceService } from './place-service'
import type { ProviderRouterService, Place } from 'zido/map-providers'

describe('PlaceService', () => {
    it('중복을 제거하고 반경 내 결과를 거리순으로 반환한다', async () => {
        const router = {
            searchNearby: jest.fn<Promise<Place[]>, Parameters<ProviderRouterService['searchNearby']>>().mockResolvedValue([
                {
                    name: '먼 장소',
                    address: '먼 주소',
                    roadAddress: '같은 도로',
                    lat: 37.6,
                    lng: 127,
                    provider: 'kakao',
                    raw: {},
                },
                {
                    name: '가까운 장소',
                    address: '가까운 주소',
                    roadAddress: '가까운 도로',
                    lat: 37.501,
                    lng: 127,
                    provider: 'kakao',
                    raw: {},
                },
                {
                    name: '가까운 장소',
                    address: '다른 주소',
                    roadAddress: '가까운 도로',
                    lat: 37.501,
                    lng: 127,
                    provider: 'naver',
                    raw: {},
                },
            ]),
        } as unknown as ProviderRouterService
        const service = new PlaceService()
        Object.defineProperty(service, 'providerRouter', { value: router })

        const result = await service.searchNearby({
            center: { lat: 37.5, lng: 127 },
            keyword: '카페',
            radiusM: 500,
        })

        expect(router.searchNearby).toHaveBeenCalledWith({ lat: 37.5, lng: 127 }, '카페', 500)
        expect(result.items).toHaveLength(1)
        expect(result.items[0]?.name).toBe('가까운 장소')
        expect(result.items[0]?.distanceM).toBeLessThanOrEqual(500)
    })
})
