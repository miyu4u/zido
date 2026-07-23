import type { PlaceService, PlaceSearchNearbyOutput } from 'zido/place-domain'
import { NearbyCommandInputSchema, executeNearbyCommand } from './nearby.command'

describe('nearby.command', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('좌표와 반경을 service.searchNearby에 재구성해서 전달하고 결과를 반환한다', async () => {
        const result: PlaceSearchNearbyOutput = {
            items: [
                {
                    name: '가까운 장소',
                    address: '서울특별시 용산구 한강대로 405',
                    roadAddress: '한강대로 405',
                    lat: 37.555,
                    lng: 126.972,
                    provider: 'naver',
                    raw: { ok: true },
                    distanceM: 123,
                },
            ],
        }
        const service = {
            searchNearby: jest.fn().mockResolvedValue(result),
        } as unknown as PlaceService
        const input = NearbyCommandInputSchema.parse({
            lat: 37.556,
            lng: 126.972,
            keyword: '  카페  ',
            radiusM: 500,
        })

        await expect(executeNearbyCommand(service, input)).resolves.toBe(result)

        expect(service.searchNearby).toHaveBeenCalledWith(
            {
                center: { lat: 37.556, lng: 126.972 },
                keyword: '카페',
                radiusM: 500,
            },
        )
    })

    it.each([
        ['위도가 NaN인 경우', { lat: Number.NaN, lng: 126.972, keyword: '카페', radiusM: 500 }],
        ['경도가 범위를 벗어난 경우', { lat: 37.556, lng: 180.1, keyword: '카페', radiusM: 500 }],
        ['반경이 0 이하인 경우', { lat: 37.556, lng: 126.972, keyword: '카페', radiusM: 0 }],
        ['keyword가 공백뿐인 경우', { lat: 37.556, lng: 126.972, keyword: '   ', radiusM: 500 }],
    ])('%s schema에서 거부한다', (_, input) => {
        expect(NearbyCommandInputSchema.safeParse(input).success).toBe(false)
    })
})
