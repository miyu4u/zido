/**
 * geo.geocode 도구 구현
 * 주소를 좌표로 변환 (지오코딩)
 */
import { geocode as providerGeocode } from '../providers/provider-router'
import { logger } from '../infra/logger'
import { McpError } from '../infra/errors'

export interface GeoGeocodeInput {
    address: string
}

export interface GeoGeocodeOutput {
    lat: number
    lng: number
    provider: string
    raw: unknown
}

/**
 * geo.geocode 실행
 */
export async function geoGeocode(input: GeoGeocodeInput): Promise<GeoGeocodeOutput | null> {
    try {
        const result = await providerGeocode(input.address)

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
        logger.error({ error, address: input.address }, 'geoGeocode failed')
        throw error instanceof McpError
            ? error
            : new McpError(
                  `Failed to geocode: ${error instanceof Error ? error.message : String(error)}`,
                  'GEOCODE_ERROR',
              )
    }
}
