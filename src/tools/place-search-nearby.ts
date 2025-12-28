/**
 * place.searchNearby 도구 구현
 * 중심 좌표 기준 주변 장소 검색
 */
import { searchNearby as providerSearchNearby } from '../providers/provider-router'
import { haversineDistance } from './utils/haversine'
import { logger } from '../infra/logger'
import { McpError } from '../infra/errors'
import type { Place } from '../providers/provider-types'

export interface PlaceSearchNearbyInput {
    center: { lat: number; lng: number }
    keyword: string
    radiusM: number
}

export interface PlaceSearchNearbyOutput {
    items: Array<Place & { distanceM: number }>
}

/**
 * place.searchNearby 실행
 */
export async function placeSearchNearby(input: PlaceSearchNearbyInput): Promise<PlaceSearchNearbyOutput> {
    try {
        // Provider에서 주변 장소 검색
        const results = await providerSearchNearby(input.center, input.keyword, input.radiusM)

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
            'placeSearchNearby completed',
        )

        return {
            items: withinRadius,
        }
    } catch (error) {
        logger.error({ error, input }, 'placeSearchNearby failed')
        throw error instanceof McpError
            ? error
            : new McpError(
                  `Failed to search nearby: ${error instanceof Error ? error.message : String(error)}`,
                  'SEARCH_NEARBY_ERROR',
              )
    }
}
