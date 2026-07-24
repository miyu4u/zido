import { config, McpException, ProviderException } from 'zido/common'
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

    describe('인증 및 결과 다양성 시나리오 (Authentication and outcome scenarios)', () => {
        it('all-auth: 모든 프로바이더가 인증되어 동작할 때 순서대로 첫 번째 성공 결과를 반환하고 이후는 호출하지 않는다', async () => {
            const firstResolve = jest.fn().mockResolvedValue(place)
            const secondResolve = jest.fn().mockResolvedValue(place)
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
            expect(secondResolve).not.toHaveBeenCalled()
        })

        it('mixed: 일부 프로바이더가 인증 실패(AUTHENTICATION_FAILED)하더라도 다음 프로바이더로 복구하여 성공한다', async () => {
            const first: Provider = {
                resolve: jest.fn().mockRejectedValue(new ProviderException('Kakao auth failed', 'kakao', 'AUTHENTICATION_FAILED')),
                searchNearby: jest.fn(),
                geocode: jest.fn(),
            }
            const second: Provider = {
                resolve: jest.fn().mockResolvedValue(place),
                searchNearby: jest.fn(),
                geocode: jest.fn(),
            }
            const router = new ProviderRouterService()
            Object.defineProperty(router, 'providers', { value: [first, second], writable: true })

            await expect(router.resolve('카페')).resolves.toBe(place)
        })

        it('mixed: 모든 프로바이더가 인증 실패하면 AUTHENTICATION_FAILED 에러 코드를 반환한다', async () => {
            const first: Provider = {
                resolve: jest.fn().mockRejectedValue(new ProviderException('Kakao auth failed', 'kakao', 'AUTHENTICATION_FAILED')),
                searchNearby: jest.fn(),
                geocode: jest.fn(),
            }
            const second: Provider = {
                resolve: jest.fn().mockRejectedValue(new ProviderException('Google auth failed', 'google', 'AUTHENTICATION_FAILED')),
                searchNearby: jest.fn(),
                geocode: jest.fn(),
            }
            const router = new ProviderRouterService()
            Object.defineProperty(router, 'providers', { value: [first, second], writable: true })

            await expect(router.resolve('카페')).rejects.toMatchObject({
                code: 'AUTHENTICATION_FAILED',
                message: expect.stringContaining('Kakao auth failed; Google auth failed'),
            })
        })

        it('auth+empty: 일부 프로바이더가 인증되었으나 빈 결과(null/빈 배열)를 반환할 때 다음 프로바이더를 시도한다', async () => {
            const first: Provider = {
                resolve: jest.fn().mockResolvedValue(null),
                searchNearby: jest.fn().mockResolvedValue([]),
                geocode: jest.fn().mockResolvedValue(null),
            }
            const second: Provider = {
                resolve: jest.fn().mockResolvedValue(place),
                searchNearby: jest.fn().mockResolvedValue([place]),
                geocode: jest.fn().mockResolvedValue(geo),
            }
            const router = new ProviderRouterService()
            Object.defineProperty(router, 'providers', { value: [first, second], writable: true })

            await expect(router.resolve('카페')).resolves.toBe(place)
            await expect(router.searchNearby({ lat: 37.5, lng: 127 }, '카페', 500)).resolves.toEqual([place])
            await expect(router.geocode('주소')).resolves.toBe(geo)
        })

        it('resolve/geocode all-null: 모든 프로바이더가 null을 반환하면 최종 결과로 null을 반환한다', async () => {
            const first: Provider = {
                resolve: jest.fn().mockResolvedValue(null),
                searchNearby: jest.fn(),
                geocode: jest.fn().mockResolvedValue(null),
            }
            const second: Provider = {
                resolve: jest.fn().mockResolvedValue(null),
                searchNearby: jest.fn(),
                geocode: jest.fn().mockResolvedValue(null),
            }
            const router = new ProviderRouterService()
            Object.defineProperty(router, 'providers', { value: [first, second], writable: true })

            await expect(router.resolve('카페')).resolves.toBeNull()
            await expect(router.geocode('주소')).resolves.toBeNull()
        })

        it('nearby all-empty: 모든 프로바이더가 빈 배열을 반환하면 최종 결과로 빈 배열을 반환한다', async () => {
            const first: Provider = {
                resolve: jest.fn(),
                searchNearby: jest.fn().mockResolvedValue([]),
                geocode: jest.fn(),
            }
            const second: Provider = {
                resolve: jest.fn(),
                searchNearby: jest.fn().mockResolvedValue([]),
                geocode: jest.fn(),
            }
            const router = new ProviderRouterService()
            Object.defineProperty(router, 'providers', { value: [first, second], writable: true })

            await expect(router.searchNearby({ lat: 37.5, lng: 127 }, '카페', 500)).resolves.toEqual([])
        })
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
