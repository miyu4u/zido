/**
 * MCP 서버에 도구 등록
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { logger } from '../infra/logger'
import { validateSearchQuery, validateAddress, validateCoordinates, validateRadius } from '../infra/input-validation'
import { PlaceService } from './place-service'

/**
 * 도구 등록
 */
export async function registerTools(server: McpServer): Promise<void> {
    const placeService = new PlaceService()

    server.registerTool(
        'place_resolve',
        {
            description: '키워드로 장소를 검색합니다 (단일 결과)',
            inputSchema: z.object({
                query: z.string().describe('검색할 장소 키워드'),
            }),
        },
        async (args: any) => {
            logger.debug({ tool: 'place_resolve', args }, 'Tool call')

            try {
                // 입력 검증
                const queryValidation = validateSearchQuery(args.query)
                if (!queryValidation.valid) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Invalid input: ${queryValidation.error}`,
                            },
                        ],
                        isError: true,
                    }
                }

                const result = await placeService.resolve({
                    query: queryValidation.sanitized!
                })
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                }
            } catch (error) {
                logger.error({ tool: 'place_resolve', error }, 'Tool call failed')
                const message = error instanceof Error ? error.message : String(error)
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${message}`,
                        },
                    ],
                    isError: true,
                }
            }
        }
    )

    server.registerTool(
        'place_search_nearby',
        {
            description: '중심 좌표 기준 주변 장소를 검색합니다',
            inputSchema: z.object({
                center: z
                    .object({
                        lat: z.number().describe('중심 위도'),
                        lng: z.number().describe('중심 경도'),
                    })
                    .describe('중심 좌표'),
                keyword: z.string().describe('검색 키워드'),
                radiusM: z.number().describe('검색 반경 (미터)'),
            }),
        },
        async (args: any) => {
            logger.debug({ tool: 'place_search_nearby', args }, 'Tool call')

            try {
                // 입력 검증
                if (!validateCoordinates(args.center.lat, args.center.lng)) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Invalid coordinates: latitude must be between -90 and 90, longitude must be between -180 and 180',
                            },
                        ],
                        isError: true,
                    }
                }

                if (!validateRadius(args.radiusM)) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Invalid radius: must be a positive number up to 50000 meters',
                            },
                        ],
                        isError: true,
                    }
                }

                const keywordValidation = validateSearchQuery(args.keyword)
                if (!keywordValidation.valid) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Invalid keyword: ${keywordValidation.error}`,
                            },
                        ],
                        isError: true,
                    }
                }

                const result = await placeService.searchNearby({
                    center: args.center,
                    keyword: keywordValidation.sanitized!,
                    radiusM: args.radiusM,
                })
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                }
            } catch (error) {
                logger.error({ tool: 'place_search_nearby', error }, 'Tool call failed')
                const message = error instanceof Error ? error.message : String(error)
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${message}`,
                        },
                    ],
                    isError: true,
                }
            }
        }
    )

    server.registerTool(
        'place_geocode',
        {
            description: '주소를 좌표로 변환합니다 (지오코딩)',
            inputSchema: z.object({
                address: z.string().describe('변환할 주소'),
            }),
        },
        async (args: any) => {
            logger.debug({ tool: 'place_geocode', args }, 'Tool call')

            try {
                // 입력 검증
                const addressValidation = validateAddress(args.address)
                if (!addressValidation.valid) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Invalid address: ${addressValidation.error}`,
                            },
                        ],
                        isError: true,
                    }
                }

                const result = await placeService.geocode({
                    address: addressValidation.sanitized!
                })
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                }
            } catch (error) {
                logger.error({ tool: 'place_geocode', error }, 'Tool call failed')
                const message = error instanceof Error ? error.message : String(error)
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${message}`,
                        },
                    ],
                    isError: true,
                }
            }
        }
    )

    logger.info('Tools registered')
}
