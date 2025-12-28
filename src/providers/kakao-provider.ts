/**
 * Kakao Local API Provider
 * 카카오 로컬 API를 사용하여 장소 검색 및 지오코딩
 */
import type { Provider, Place, GeoResult } from './provider-types'
import { ProviderError } from '../infra/errors'
import { logger } from '../infra/logger'

interface KakaoProviderConfig {
    restKey: string
}

interface KakaoKeywordSearchResponse {
    documents: Array<{
        place_name: string
        address_name: string
        road_address_name?: string
        x: string // 경도
        y: string // 위도
        [key: string]: unknown
    }>
    meta: {
        total_count: number
        pageable_count: number
        is_end: boolean
    }
}

interface KakaoCategorySearchResponse {
    documents: Array<{
        place_name: string
        address_name: string
        road_address_name?: string
        x: string
        y: string
        distance?: string
        [key: string]: unknown
    }>
    meta: {
        total_count: number
        pageable_count: number
        is_end: boolean
    }
}

interface KakaoAddressSearchResponse {
    documents: Array<{
        address_name: string
        y: string // 위도
        x: string // 경도
        address_type: string
        [key: string]: unknown
    }>
    meta: {
        total_count: number
        pageable_count: number
        is_end: boolean
    }
}

export class KakaoProvider implements Provider {
    private readonly restKey: string
    private readonly baseUrl = 'https://dapi.kakao.com/v2/local'

    constructor(config: KakaoProviderConfig) {
        if (!config.restKey) {
            throw new ProviderError('Kakao REST API key is required', 'kakao', 'MISSING_API_KEY')
        }
        this.restKey = config.restKey
    }

    /**
     * 키워드로 장소 검색 (단일 결과)
     */
    async resolve(query: string): Promise<Place | null> {
        try {
            const url = new URL(`${this.baseUrl}/search/keyword.json`)
            url.searchParams.set('query', query)
            url.searchParams.set('size', '1') // 첫 번째 결과만

            const response = await fetch(url.toString(), {
                headers: {
                    Authorization: `KakaoAK ${this.restKey}`,
                },
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new ProviderError(`Kakao API error: ${response.status} ${errorText}`, 'kakao', 'API_ERROR')
            }

            const data: KakaoKeywordSearchResponse = await response.json()

            if (data.documents.length === 0) {
                return null
            }

            const doc = data.documents[0]
            return {
                name: doc.place_name,
                address: doc.address_name,
                roadAddress: doc.road_address_name,
                lat: parseFloat(doc.y),
                lng: parseFloat(doc.x),
                provider: 'kakao',
                raw: doc,
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error
            }
            logger.error({ error, query }, 'Kakao resolve failed')
            throw new ProviderError(
                `Failed to resolve: ${error instanceof Error ? error.message : String(error)}`,
                'kakao',
            )
        }
    }

    /**
     * 중심 좌표 기준 주변 장소 검색
     */
    async searchNearby(center: { lat: number; lng: number }, keyword: string, radiusM: number): Promise<Place[]> {
        try {
            const url = new URL(`${this.baseUrl}/search/keyword.json`)
            url.searchParams.set('query', keyword)
            url.searchParams.set('x', center.lng.toString())
            url.searchParams.set('y', center.lat.toString())
            url.searchParams.set('radius', radiusM.toString())
            url.searchParams.set('size', '15') // 최대 15개

            const response = await fetch(url.toString(), {
                headers: {
                    Authorization: `KakaoAK ${this.restKey}`,
                },
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new ProviderError(`Kakao API error: ${response.status} ${errorText}`, 'kakao', 'API_ERROR')
            }

            const data: KakaoCategorySearchResponse = await response.json()

            return data.documents.map((doc) => ({
                name: doc.place_name,
                address: doc.address_name,
                roadAddress: doc.road_address_name,
                lat: parseFloat(doc.y),
                lng: parseFloat(doc.x),
                provider: 'kakao',
                raw: doc,
                // Kakao API는 distance를 제공하지만 미터 단위가 아닐 수 있으므로
                // 나중에 하버사인으로 재계산
                distanceM: doc.distance ? parseFloat(doc.distance) : undefined,
            }))
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error
            }
            logger.error({ error, keyword, center }, 'Kakao searchNearby failed')
            throw new ProviderError(
                `Failed to search nearby: ${error instanceof Error ? error.message : String(error)}`,
                'kakao',
            )
        }
    }

    /**
     * 주소를 좌표로 변환 (지오코딩)
     */
    async geocode(address: string): Promise<GeoResult | null> {
        try {
            const url = new URL(`${this.baseUrl}/search/address.json`)
            url.searchParams.set('query', address)

            const response = await fetch(url.toString(), {
                headers: {
                    Authorization: `KakaoAK ${this.restKey}`,
                },
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new ProviderError(`Kakao API error: ${response.status} ${errorText}`, 'kakao', 'API_ERROR')
            }

            const data: KakaoAddressSearchResponse = await response.json()

            if (data.documents.length === 0) {
                return null
            }

            const doc = data.documents[0]
            return {
                lat: parseFloat(doc.y),
                lng: parseFloat(doc.x),
                provider: 'kakao',
                raw: doc,
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error
            }
            logger.error({ error, address }, 'Kakao geocode failed')
            throw new ProviderError(
                `Failed to geocode: ${error instanceof Error ? error.message : String(error)}`,
                'kakao',
            )
        }
    }
}
