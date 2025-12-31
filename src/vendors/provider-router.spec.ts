import { McpError } from '../infra/errors'
import 'dotenv/config'

describe('ProviderRouter(e2e)', () => {
    jest.setTimeout(20000)

    describe('initializeProviders', () => {
        it('Case1: kakao provider 인스턴스를 생성해야 함', async () => {
            const { ProviderRouter } = await import('./provider-router')
            const providers = ProviderRouter.initializeProviders()
            console.log(providers.map((p) => p.constructor.name))
            expect(Array.isArray(providers)).toBe(true)
            expect(providers.length).toBeGreaterThan(0)
        })
    })

    describe('resolve', () => {
        it('Case1: 실제 Kakao API로 장소를 resolve 해야 함', async () => {
            const { ProviderRouter } = await import('./provider-router')
            const result = await ProviderRouter.resolve('강남역')
            console.log(result)
            expect(result).toBeTruthy()
            expect(result).toHaveProperty('provider', 'kakao')
        })

        it('Case2: 결과가 없으면 McpError를 throw 해야 함', async () => {
            const { ProviderRouter } = await import('./provider-router')
            const query = `__no_result_query_${Date.now()}__`

            let thrown: unknown = null
            try {
                await ProviderRouter.resolve(query)
            } catch (error) {
                thrown = error
            }

            console.log(thrown)
            expect(thrown).toBeInstanceOf(McpError)
        })
    })

    describe('searchNearby', () => {
        it('Case1: 실제 Kakao API로 주변 장소를 검색해야 함', async () => {
            const { ProviderRouter } = await import('./provider-router')
            const results = await ProviderRouter.searchNearby({ lat: 37.5665, lng: 126.978 }, '카페', 1000)
            console.log(results)
            expect(Array.isArray(results)).toBe(true)
            expect((results as unknown[]).length).toBeGreaterThan(0)
        })

        it('Case2: 결과가 없으면 McpError를 throw 해야 함', async () => {
            const { ProviderRouter } = await import('./provider-router')
            const keyword = `__no_result_keyword_${Date.now()}__`

            let thrown: unknown = null
            try {
                await ProviderRouter.searchNearby({ lat: 0, lng: 0 }, keyword, 100)
            } catch (error) {
                thrown = error
            }

            console.log(thrown)
            expect(thrown).toBeInstanceOf(McpError)
        })
    })

    describe('geocode', () => {
        it('Case1: 실제 Kakao API로 주소를 geocode 해야 함', async () => {
            const { ProviderRouter } = await import('./provider-router')
            const result = await ProviderRouter.geocode('서울특별시 중구 세종대로 110')
            console.log(result)
            expect(result).toBeTruthy()
            expect(result).toHaveProperty('provider', 'kakao')
        })

        it('Case2: 결과가 없으면 McpError를 throw 해야 함', async () => {
            const { ProviderRouter } = await import('./provider-router')
            const address = `__no_result_address_${Date.now()}__`

            let thrown: unknown = null
            try {
                await ProviderRouter.geocode(address)
            } catch (error) {
                thrown = error
            }

            console.log(thrown)
            expect(thrown).toBeInstanceOf(McpError)
        })
    })
})
