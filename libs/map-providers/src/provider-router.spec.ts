import { config, McpException } from 'zido/configuration'
import { GoogleVendor } from './google/google.vendor'
import { KakaoVendor } from './kakao/kakao.vendor'
import { NaverVendor } from './naver/naver.vendor'
import type { GeoResult, Place, Provider } from './typed'
import { ProviderRouterService } from './provider-router'

const place: Place = {
    name: '장소',
    address: '주소',
    lat: 37.5,
    lng: 127,
    provider: 'test',
    raw: {},
}

const geo: GeoResult = {
    lat: 37.5,
    lng: 127,
    provider: 'test',
    raw: {},
}

describe('ProviderRouterService', () => {
    it('resolve는 첫 성공 결과를 반환한다', async () => {
        const firstResolve = jest.fn<Promise<Place | null>, [string]>().mockResolvedValue(null)
        const secondResolve = jest.fn<Promise<Place | null>, [string]>().mockResolvedValue(place)
        const first: Provider = {
            resolve: firstResolve,
            searchNearby: jest.fn(),
            geocode: jest.fn(),
        }
        const second: Provider = {
            resolve: secondResolve,
            searchNearby: jest.fn(),
            geocode: jest.fn(),
        }
        const router = new ProviderRouterService()
        Object.defineProperty(router, 'providers', { value: [first, second], writable: true })

        await expect(router.resolve('카페')).resolves.toBe(place)
        expect(firstResolve).toHaveBeenCalledWith('카페')
        expect(secondResolve).toHaveBeenCalledWith('카페')
    })

    it('searchNearby와 geocode도 빈 결과 뒤 다음 provider로 fallback한다', async () => {
        const first: Provider = {
            resolve: jest.fn(),
            searchNearby: jest.fn().mockResolvedValue([]),
            geocode: jest.fn().mockResolvedValue(null),
        }
        const second: Provider = {
            resolve: jest.fn(),
            searchNearby: jest.fn().mockResolvedValue([place]),
            geocode: jest.fn().mockResolvedValue(geo),
        }
        const router = new ProviderRouterService()
        Object.defineProperty(router, 'providers', { value: [first, second], writable: true })

        await expect(router.searchNearby({ lat: 37.5, lng: 127 }, '카페', 500)).resolves.toEqual([place])
        await expect(router.geocode('주소')).resolves.toBe(geo)
    })

    it('모든 provider 실패 시 명시적인 McpException으로 오류를 합친다', async () => {
        const first: Provider = {
            resolve: jest.fn().mockRejectedValueOnce(new Error('first failed')).mockRejectedValueOnce('second failed'),
            searchNearby: jest.fn(),
            geocode: jest.fn(),
        }
        const second: Provider = {
            resolve: jest.fn().mockRejectedValue('second failed'),
            searchNearby: jest.fn(),
            geocode: jest.fn(),
        }
        const router = new ProviderRouterService()
        Object.defineProperty(router, 'providers', { value: [first, second], writable: true })

        await expect(router.resolve('카페')).rejects.toMatchObject({
            code: 'NO_PROVIDER_AVAILABLE',
            message: 'Failed to resolve "카페" from all providers. Errors: first failed; second failed',
        })
    })

    it('provider가 없으면 설정 오류를 발생시킨다', async () => {
        const router = new ProviderRouterService()
        Object.defineProperty(router, 'providers', { value: [], writable: true })

        await expect(router.geocode('주소')).rejects.toMatchObject({
            code: 'NO_PROVIDER_CONFIGURED',
        })
        await expect(router.geocode('주소')).rejects.toThrow('No providers available')
        await expect(router.geocode('주소')).rejects.toBeInstanceOf(McpException)
    })

    it('provider를 설정된 순서와 키에 따라 지연 초기화한다', () => {
        const providerConfig = config.providers as unknown as {
            order: string[]
            kakao: { restKey: string }
            naver: { clientId: string; clientSecret: string }
            google: { apiKey: string }
        }
        const original = {
            order: providerConfig.order,
            kakao: providerConfig.kakao,
            naver: providerConfig.naver,
            google: providerConfig.google,
        }
        providerConfig.order = ['google', 'unknown', 'kakao', 'naver']
        providerConfig.kakao = { restKey: 'kakao-key' }
        providerConfig.naver = { clientId: 'client', clientSecret: 'secret' }
        providerConfig.google = { apiKey: 'google-key' }
        const router = new ProviderRouterService()
        try {
            const providers = (router as unknown as { getProviders: () => Provider[] }).getProviders()

            expect(providers).toHaveLength(3)
            expect(providers[0]).toBeInstanceOf(GoogleVendor)
            expect(providers[1]).toBeInstanceOf(KakaoVendor)
            expect(providers[2]).toBeInstanceOf(NaverVendor)
        } finally {
            providerConfig.order = original.order
            providerConfig.kakao = original.kakao
            providerConfig.naver = original.naver
            providerConfig.google = original.google
        }
    })
})
