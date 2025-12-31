import { NaverVendor } from './naver.vendor'
import 'dotenv/config'

describe('NaverVendor', () => {
    let service: NaverVendor

    beforeEach(() => {
        service = new NaverVendor({
            clientId: process.env.NAVER_CLIENT_ID || '',
            clientSecret: process.env.NAVER_CLIENT_SECRET || '',
        })
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })

    describe('resolve', () => {
        it('Case 1: 서울역 스타벅스', async () => {
            const place = await service.resolve('서울역 스타벅스')
            console.log(place)
            expect(place).toBeDefined()
            expect(place?.name).toContain('스타벅스')
        })
    })

    describe('searchNearby', () => {
        it('Case 1: 서울역 스타벅스', async () => {
            const places = await service.searchNearby({ lat: 37.5539, lng: 126.9728 }, '스타벅스', 500)
            console.log(places)
            expect(places).toBeDefined()
            expect(places?.length).toBeGreaterThan(0)
        })
    })

    describe('geocode', () => {
        it('Case 1: 서울역 스타벅스', async () => {
            const geo = await service.geocode('서울특별시 중구 한강대로 405')
            console.log(geo)
            expect(geo).toBeDefined()
            expect(geo?.lat).toBeCloseTo(37.5539, 1)
            expect(geo?.lng).toBeCloseTo(126.9728, 1)
        })
    })
})
