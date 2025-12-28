/**
 * Provider 선택 및 fallback 로직
 * PROVIDER_ORDER 설정에 따라 우선순위 결정
 */
import { config } from '../infra/config'
import { logger } from '../infra/logger'
import { ProviderError, McpError } from '../infra/errors'
import type { Provider, Place, GeoResult } from './provider-types'
import { MockProvider } from './mock-provider'
import { KakaoProvider } from './kakao-provider'

// Provider 인스턴스 캐시
let providers: Provider[] | null = null

/**
 * Provider 인스턴스 초기화
 */
function initializeProviders(): Provider[] {
    if (providers !== null) {
        return providers
    }

    providers = []

    // PROVIDER_ORDER 설정에 따라 Provider 추가
    for (const providerName of config.providers.order) {
        try {
            switch (providerName.trim()) {
                case 'kakao':
                    if (config.providers.kakao.restKey) {
                        const kakaoProvider = new KakaoProvider(config.providers.kakao)
                        providers.push(kakaoProvider)
                        logger.debug('Kakao provider added')
                    } else {
                        logger.warn('Kakao provider skipped: missing REST API key')
                    }
                    break

                case 'naver':
                    // TODO: Phase 5에서 구현
                    logger.debug('Naver provider skipped: not implemented yet')
                    break

                case 'google':
                    // TODO: Phase 5에서 구현
                    logger.debug('Google provider skipped: not implemented yet')
                    break

                default:
                    logger.warn({ provider: providerName }, 'Unknown provider name')
            }
        } catch (error) {
            logger.warn({ provider: providerName, error }, 'Failed to initialize provider')
        }
    }

    // Mock Provider는 항상 마지막에 추가 (fallback용)
    const mockProvider = new MockProvider()
    providers.push(mockProvider)

    logger.info(
        { providers: providers.map((p) => (p instanceof KakaoProvider ? 'kakao' : 'mock')) },
        'Providers initialized',
    )

    return providers
}

/**
 * 키워드로 장소 검색 (첫 번째 성공 응답 반환)
 */
export async function resolve(query: string): Promise<Place | null> {
    const providerList = initializeProviders()
    const errors: Error[] = []

    for (const provider of providerList) {
        try {
            const result = await provider.resolve(query)
            if (result) {
                logger.debug({ provider: result.provider, query }, 'Resolve success')
                return result
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error))
            errors.push(err)
            logger.warn({ query, error: err.message }, 'Resolve failed, trying next provider')
        }
    }

    // 모든 Provider 실패
    throw new McpError(`Failed to resolve "${query}" from all providers`, 'NO_PROVIDER_AVAILABLE')
}

/**
 * 주변 장소 검색 (첫 번째 성공 응답 반환)
 */
export async function searchNearby(
    center: { lat: number; lng: number },
    keyword: string,
    radiusM: number,
): Promise<Place[]> {
    const providerList = initializeProviders()
    const errors: Error[] = []

    for (const provider of providerList) {
        try {
            const results = await provider.searchNearby(center, keyword, radiusM)
            if (results.length > 0) {
                logger.debug({ keyword, count: results.length }, 'SearchNearby success')
                return results
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error))
            errors.push(err)
            logger.warn({ keyword, error: err.message }, 'SearchNearby failed, trying next provider')
        }
    }

    // 모든 Provider 실패
    throw new McpError(`Failed to search nearby "${keyword}" from all providers`, 'NO_PROVIDER_AVAILABLE')
}

/**
 * 주소를 좌표로 변환 (첫 번째 성공 응답 반환)
 */
export async function geocode(address: string): Promise<GeoResult | null> {
    const providerList = initializeProviders()
    const errors: Error[] = []

    for (const provider of providerList) {
        try {
            const result = await provider.geocode(address)
            if (result) {
                logger.debug({ provider: result.provider, address }, 'Geocode success')
                return result
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error))
            errors.push(err)
            logger.warn({ address, error: err.message }, 'Geocode failed, trying next provider')
        }
    }

    // 모든 Provider 실패
    throw new McpError(`Failed to geocode "${address}" from all providers`, 'NO_PROVIDER_AVAILABLE')
}
