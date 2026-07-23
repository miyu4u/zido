import { Injectable } from '@nestjs/common'
import { McpException, logger } from 'zido/common'
import { haversineDistance } from './haversine'
import { ProviderRouterService } from 'zido/map-providers'
import type {
    GeoGeocodeInput,
    GeoGeocodeOutput,
    PlaceResolveInput,
    PlaceResolveOutput,
    PlaceSearchNearbyInput,
    PlaceSearchNearbyOutput,
} from './typed'

/**
 * 장소 orchestration이 외부에 제공하는 작업 contract를 정의한다.
 */
export interface PlaceServiceInterface {
    /**
     * 주소를 좌표로 변환한다.
     */
    geocode(input: GeoGeocodeInput): Promise<GeoGeocodeOutput | null>

    /**
     * 검색어에 해당하는 단일 장소를 반환한다.
     */
    resolve(input: PlaceResolveInput): Promise<PlaceResolveOutput | null>

    /**
     * 중심 좌표 주변의 장소를 거리순으로 반환한다.
     */
    searchNearby(input: PlaceSearchNearbyInput): Promise<PlaceSearchNearbyOutput>
}

/**
 * 장소 관련 기능을 통합 제공하는 서비스 클래스
 */
@Injectable()
export class PlaceService implements PlaceServiceInterface {
    constructor(private readonly providerRouter: ProviderRouterService) {}

    async geocode(input: GeoGeocodeInput): Promise<GeoGeocodeOutput | null> {
        try {
            const result = await this.providerRouter.geocode(input.address)

            if (!result) {
                return null
            }

            return {
                lat: result.lat,
                lng: result.lng,
                provider: result.provider,
                raw: result.raw,
            }
        } catch (error) {
            logger.error({ error, address: input.address }, 'geocode failed')
            throw error instanceof McpException
                ? error
                : new McpException(
                    `Failed to geocode: ${error instanceof Error ? error.message : String(error)}`,
                    'GEOCODE_ERROR',
                )
        }
    }

    async resolve(input: PlaceResolveInput): Promise<PlaceResolveOutput | null> {
        try {
            const result = await this.providerRouter.resolve(input.query)

            if (!result) {
                return null
            }

            return {
                name: result.name,
                address: result.address,
                lat: result.lat,
                lng: result.lng,
                provider: result.provider,
                raw: result.raw,
            }
        } catch (error) {
            logger.error({ error, query: input.query }, 'resolve failed')
            throw error instanceof McpException
                ? error
                : new McpException(
                    `Failed to resolve place: ${error instanceof Error ? error.message : String(error)}`,
                    'RESOLVE_ERROR',
                )
        }
    }

    async searchNearby(input: PlaceSearchNearbyInput): Promise<PlaceSearchNearbyOutput> {
        try {
            // Provider에서 주변 장소 검색
            const results = await this.providerRouter.searchNearby(input.center, input.keyword, input.radiusM)

            // 각 item에 거리 계산 및 추가
            const itemsWithDistance = results.map((item) => {
                const distanceM = haversineDistance(input.center.lat, input.center.lng, item.lat, item.lng)

                return {
                    ...item,
                    distanceM: Math.round(distanceM), // 미터 단위, 반올림
                }
            })

            // 중복 제거: (name + roadAddress) 기준
            const seen = new Set<string>()
            const deduplicated = itemsWithDistance.filter((item) => {
                const key = `${item.name}|${item.roadAddress || item.address}`
                if (seen.has(key)) {
                    return false
                }
                seen.add(key)
                return true
            })

            // distanceM 오름차순 정렬
            deduplicated.sort((a, b) => a.distanceM - b.distanceM)

            // 반경 내 장소만 필터링
            const withinRadius = deduplicated.filter((item) => item.distanceM <= input.radiusM)

            logger.debug(
                {
                    keyword: input.keyword,
                    radiusM: input.radiusM,
                    total: results.length,
                    deduplicated: deduplicated.length,
                    withinRadius: withinRadius.length,
                },
                'searchNearby completed',
            )

            return {
                items: withinRadius,
            }
        } catch (error) {
            logger.error({ error, input }, 'searchNearby failed')
            throw error instanceof McpException
                ? error
                : new McpException(
                    `Failed to search nearby: ${error instanceof Error ? error.message : String(error)}`,
                    'SEARCH_NEARBY_ERROR',
                )
        }
    }
}
