import { Injectable } from '@nestjs/common'
import { config, McpException, logger } from 'zido/configuration'
import { GoogleVendor } from './google/google.vendor'
import { KakaoVendor } from './kakao/kakao.vendor'
import { NaverVendor } from './naver/naver.vendor'
import type { GeoResult, Place, Provider } from './typed'

/**
 * 설정된 순서로 provider를 생성하고 첫 성공 응답까지 fallback한다.
 */
@Injectable()
export class ProviderRouterService {
    private providers: Provider[] | null = null

    /** API key가 있는 provider만 설정 순서대로 초기화한다. */
    private initializeProviders(): Provider[] {
        const providers: Provider[] = []
        for (const providerName of config.providers.order) {
            try {
                switch (providerName.trim()) {
                    case 'kakao':
                        if (config.providers.kakao.restKey) {
                            providers.push(new KakaoVendor(config.providers.kakao))
                            logger.debug('Kakao provider added')
                        } else {
                            logger.warn('Kakao provider skipped: missing REST API key')
                        }
                        break
                    case 'naver':
                        if (config.providers.naver.clientId && config.providers.naver.clientSecret) {
                            providers.push(new NaverVendor(config.providers.naver))
                            logger.debug('Naver provider added')
                        } else {
                            logger.warn('Naver provider skipped: missing client credentials')
                        }
                        break
                    case 'google':
                        if (config.providers.google.apiKey) {
                            providers.push(new GoogleVendor(config.providers.google))
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
        return providers
    }

    /** 키워드 검색에서 첫 번째 장소 결과를 반환한다. */
    async resolve(query: string): Promise<Place | null> {
        const errors: Error[] = []
        this.assertProviders()
        for (const provider of this.getProviders()) {
            try {
                const result = await provider.resolve(query)
                if (result) return result
            } catch (error) {
                errors.push(error instanceof Error ? error : new Error(String(error)))
            }
        }
        throw this.createFailureError(`Failed to resolve "${query}" from all providers.`, errors)
    }

    /** 좌표 주변 검색에서 첫 번째 비어 있지 않은 결과를 반환한다. */
    async searchNearby(center: { lat: number; lng: number }, keyword: string, radiusM: number): Promise<Place[]> {
        const errors: Error[] = []
        this.assertProviders()
        for (const provider of this.getProviders()) {
            try {
                const results = await provider.searchNearby(center, keyword, radiusM)
                if (results.length > 0) return results
            } catch (error) {
                errors.push(error instanceof Error ? error : new Error(String(error)))
            }
        }
        throw this.createFailureError(`Failed to search nearby "${keyword}" from all providers.`, errors)
    }

    /** 주소 변환에서 첫 번째 좌표 결과를 반환한다. */
    async geocode(address: string): Promise<GeoResult | null> {
        const errors: Error[] = []
        this.assertProviders()
        for (const provider of this.getProviders()) {
            try {
                const result = await provider.geocode(address)
                if (result) return result
            } catch (error) {
                errors.push(error instanceof Error ? error : new Error(String(error)))
            }
        }
        throw this.createFailureError(`Failed to geocode "${address}" from all providers.`, errors)
    }

    /** provider가 하나도 없을 때 명시적인 설정 오류를 발생시킨다. */
    private assertProviders(): void {
        if (this.getProviders().length === 0) {
            throw new McpException(
                'No providers available. Please check your API keys in .env file (KAKAO_REST_KEY, NAVER_CLIENT_ID, etc.)',
                'NO_PROVIDER_CONFIGURED',
            )
        }
    }

    /** property injection이 완료된 뒤 provider 목록을 지연 초기화한다. */
    private getProviders(): Provider[] {
        this.providers ??= this.initializeProviders()
        return this.providers
    }

    /** fallback 오류들을 외부 MCP error contract로 합친다. */
    private createFailureError(message: string, errors: Error[]): McpException {
        const errorDetails = errors.map((error) => error.message).join('; ')
        return new McpException(`${message} Errors: ${errorDetails}`, 'NO_PROVIDER_AVAILABLE')
    }
}
