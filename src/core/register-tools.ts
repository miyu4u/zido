/**
 * MCP 서버에 도구 등록
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types/index'
import { z } from 'zod'
import { logger } from '../infra/logger'
import { geoGeocode } from '../tools/geo-geocode'
import { placeResolve } from '../tools/place-resolve'
import { placeSearchNearby } from '../tools/place-search-nearby'

/**
 * Zod 스키마를 JSON Schema로 변환하는 헬퍼
 * (간단한 버전 - 복잡한 경우 zod-to-json-schema 라이브러리 사용 고려)
 */
function zodToJsonSchema(schema: z.ZodTypeAny): unknown {
    // 간단한 변환 (zod의 내부 메서드 활용)
    if (schema instanceof z.ZodObject) {
        const shape = schema.shape
        const properties: Record<string, unknown> = {}
        const required: string[] = []

        for (const [key, value] of Object.entries(shape)) {
            if (value instanceof z.ZodType) {
                const fieldSchema = zodToJsonSchema(value)
                properties[key] = fieldSchema

                // required 필드 확인
                if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
                    required.push(key)
                }
            }
        }

        return {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
        }
    }

    if (schema instanceof z.ZodString) {
        return { type: 'string' }
    }

    if (schema instanceof z.ZodNumber) {
        return { type: 'number' }
    }

    if (schema instanceof z.ZodOptional) {
        return zodToJsonSchema(schema._def.innerType)
    }

    if (schema instanceof z.ZodDefault) {
        return zodToJsonSchema(schema._def.innerType)
    }

    // 기본값
    return {}
}

/**
 * 도구 등록
 */
export async function registerTools(server: Server): Promise<void> {
    // tools/list 핸들러
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: 'place.resolve',
                description: '키워드로 장소를 검색합니다 (단일 결과)',
                inputSchema: zodToJsonSchema(
                    z.object({
                        query: z.string().describe('검색할 장소 키워드'),
                    }),
                ) as unknown,
            },
            {
                name: 'place.searchNearby',
                description: '중심 좌표 기준 주변 장소를 검색합니다',
                inputSchema: zodToJsonSchema(
                    z.object({
                        center: z
                            .object({
                                lat: z.number().describe('중심 위도'),
                                lng: z.number().describe('중심 경도'),
                            })
                            .describe('중심 좌표'),
                        keyword: z.string().describe('검색 키워드'),
                        radiusM: z.number().describe('검색 반경 (미터)'),
                    }),
                ) as unknown,
            },
            {
                name: 'geo.geocode',
                description: '주소를 좌표로 변환합니다 (지오코딩)',
                inputSchema: zodToJsonSchema(
                    z.object({
                        address: z.string().describe('변환할 주소'),
                    }),
                ) as unknown,
            },
        ],
    }))

    // tools/call 핸들러
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params

        logger.debug({ tool: name, args }, 'Tool call')

        try {
            switch (name) {
                case 'place.resolve': {
                    const resolveInput = z
                        .object({
                            query: z.string(),
                        })
                        .parse(args || {})
                    const result = await placeResolve(resolveInput)
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    }
                }

                case 'place.searchNearby': {
                    const searchInput = z
                        .object({
                            center: z.object({
                                lat: z.number(),
                                lng: z.number(),
                            }),
                            keyword: z.string(),
                            radiusM: z.number(),
                        })
                        .parse(args || {})
                    const result = await placeSearchNearby(searchInput)
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    }
                }

                case 'geo.geocode': {
                    const geocodeInput = z
                        .object({
                            address: z.string(),
                        })
                        .parse(args || {})
                    const result = await geoGeocode(geocodeInput)
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    }
                }

                default:
                    throw new Error(`Unknown tool: ${name}`)
            }
        } catch (error) {
            logger.error({ tool: name, error }, 'Tool call failed')
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`Tool execution failed: ${message}`)
        }
    })

    logger.info('Tools registered')
}
