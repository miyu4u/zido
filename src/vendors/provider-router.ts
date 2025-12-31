/**
 * Provider 선택 및 fallback 로직
 * PROVIDER_ORDER 설정에 따라 우선순위 결정
 */
import { config } from '../infra/config'
import { McpError } from '../infra/errors'
import { logger } from '../infra/logger'
import { GoogleVendor } from './google/google.vendor'
import { KakaoVendor } from './kakao/kakao.vendor'
import { NaverVendor } from './naver/naver.vendor'
import type { GeoResult, Place, Provider } from './typed'

/**
 * Static Provider Router 클래스
 * Provider 인스턴스 관리 및 fallback 로직 제공
 */
export class ProviderRouter {
    // Provider 인스턴스 캐시
    private static providers: Provider[] | null = null

    /**
     * Provider 인스턴스 초기화
     */
    static initializeProviders(): Provider[] {
        if (this.providers !== null) {
            return this.providers
        }

        this.providers = []

        // PROVIDER_ORDER 설정에 따라 Provider 추가
        for (const providerName of config.providers.order) {
            try {
                switch (providerName.trim()) {
                    case 'kakao':
                        if (config.providers.kakao.restKey) {
                            const kakaoProvider = new KakaoVendor(config.providers.kakao)
                            this.providers.push(kakaoProvider)
                            logger.debug('Kakao provider added')
                        } else {
                            logger.warn('Kakao provider skipped: missing REST API key')
                        }
                        break

                    case 'naver':
                        if (config.providers.naver.clientId && config.providers.naver.clientSecret) {
                            const naverProvider = new NaverVendor(config.providers.naver)
                            this.providers.push(naverProvider)
                            logger.debug('Naver provider added')
                        } else {
                            logger.warn('Naver provider skipped: missing client credentials')
                        }
                        break

                    case 'google':
                        if (config.providers.google.apiKey) {
                            const googleProvider = new GoogleVendor(config.providers.google)
                            this.providers.push(googleProvider)
                            logger.debug('Google provider added')
                        } else {
                            logger.warn('Google provider skipped: missing API key')
                        }
                        break

                    default:
                        logger.warn({ provider: providerName }, 'Unknown provider name')
                }
            } catch (error) {
                logger.warn({ provider: providerName, error }, 'Failed to initialize provider')
            }
        }

        return this.providers
    }

    /**
     * 키워드로 장소 검색 (첫 번째 성공 응답 반환)
     */
    static async resolve(query: string): Promise<Place | null> {
        const providerList = this.initializeProviders()

        if (providerList.length === 0) {
            throw new McpError(
                'No providers available. Please check your API keys in .env file (KAKAO_REST_KEY, NAVER_CLIENT_ID, etc.)',
                'NO_PROVIDER_CONFIGURED',
            )
        }

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
        const errorDetails = errors.map((e) => e.message).join('; ')
        throw new McpError(
            `Failed to resolve "${query}" from all providers. Errors: ${errorDetails}`,
            'NO_PROVIDER_AVAILABLE',
        )
    }

    /**
     * 주변 장소 검색 (첫 번째 성공 응답 반환)
     */
    static async searchNearby(
        center: { lat: number; lng: number },
        keyword: string,
        radiusM: number,
    ): Promise<Place[]> {
        const providerList = this.initializeProviders()

        if (providerList.length === 0) {
            throw new McpError(
                'No providers available. Please check your API keys in .env file (KAKAO_REST_KEY, NAVER_CLIENT_ID, etc.)',
                'NO_PROVIDER_CONFIGURED',
            )
        }

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
        const errorDetails = errors.map((e) => e.message).join('; ')
        throw new McpError(
            `Failed to search nearby "${keyword}" from all providers. Errors: ${errorDetails}`,
            'NO_PROVIDER_AVAILABLE',
        )
    }

    /**
     * 주소를 좌표로 변환 (첫 번째 성공 응답 반환)
     */
    static async geocode(address: string): Promise<GeoResult | null> {
        const providerList = this.initializeProviders()

        if (providerList.length === 0) {
            throw new McpError(
                'No providers available. Please check your API keys in .env file (KAKAO_REST_KEY, NAVER_CLIENT_ID, etc.)',
                'NO_PROVIDER_CONFIGURED',
            )
        }

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
        const errorDetails = errors.map((e) => e.message).join('; ')
        throw new McpError(
            `Failed to geocode "${address}" from all providers. Errors: ${errorDetails}`,
            'NO_PROVIDER_AVAILABLE',
        )
    }
}
