/**
 * place.resolve 도구 구현
 * 키워드로 장소 검색 (단일 결과)
 */
import { resolve as providerResolve } from '../providers/provider-router'
import { logger } from '../infra/logger'
import { McpError } from '../infra/errors'

export interface PlaceResolveInput {
    query: string
}

export interface PlaceResolveOutput {
    name: string
    address: string
    lat: number
    lng: number
    provider: string
    raw: unknown
}

/**
 * place.resolve 실행
 */
export async function placeResolve(input: PlaceResolveInput): Promise<PlaceResolveOutput | null> {
    try {
        const result = await providerResolve(input.query)

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
        logger.error({ error, query: input.query }, 'placeResolve failed')
        throw error instanceof McpError
            ? error
            : new McpError(
                  `Failed to resolve place: ${error instanceof Error ? error.message : String(error)}`,
                  'RESOLVE_ERROR',
              )
    }
}
