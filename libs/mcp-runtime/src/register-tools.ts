import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Injectable } from '@nestjs/common'
import {
  McpException,
  logger,
  validateAddress,
  validateCoordinates,
  validateRadius,
  validateSearchQuery,
} from 'zido/common'
import { PlaceService } from 'zido/place-domain'
import { ChargerService, CollectionScopeInputSchema } from 'zido/charger-domain'
import { z } from 'zod'

/**
 * place domain 기능을 MCP tool로 노출하는 registry contract입니다.
 */
export interface McpToolRegistrarServiceInterface {
  /**
   * 지원하는 place tool과 handler를 전달받은 MCP server에 연결합니다.
   */
  registerTools(server: McpServer): Promise<void>
}

@Injectable()
export class McpToolRegistrarService implements McpToolRegistrarServiceInterface {
  constructor(
    private readonly placeService: PlaceService,
    private readonly chargerService: ChargerService,
  ) {}

  /**
   * 입력 검증과 오류 응답을 포함한 place tool handler 전체를 server에 등록합니다.
   */
  async registerTools(server: McpServer): Promise<void> {
    server.registerTool(
      'place_resolve',
      {
        description: '키워드로 장소를 검색합니다 (단일 결과)',
        inputSchema: z.object({
          query: z.string().describe('검색할 장소 키워드'),
        }),
      },
      async (args) => {
        logger.debug({ tool: 'place_resolve' }, 'Tool call')

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

          const result = await this.placeService.resolve({
            query: queryValidation.sanitized!,
          })
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          }
        } catch {
          logger.error({ tool: 'place_resolve' }, 'Tool call failed')
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Tool request failed',
              },
            ],
            isError: true,
          }
        }
      },
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
      async (args) => {
        logger.debug({ tool: 'place_search_nearby' }, 'Tool call')

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

          const result = await this.placeService.searchNearby({
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
        } catch {
          logger.error({ tool: 'place_search_nearby' }, 'Tool call failed')
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Tool request failed',
              },
            ],
            isError: true,
          }
        }
      },
    )

    server.registerTool(
      'place_geocode',
      {
        description: '주소를 좌표로 변환합니다 (지오코딩)',
        inputSchema: z.object({
          address: z.string().describe('변환할 주소'),
        }),
      },
      async (args) => {
        logger.debug({ tool: 'place_geocode' }, 'Tool call')

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

          const result = await this.placeService.geocode({
            address: addressValidation.sanitized!,
          })
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          }
        } catch {
          logger.error({ tool: 'place_geocode' }, 'Tool call failed')
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Tool request failed',
              },
            ],
            isError: true,
          }
        }
      },
    )

    server.registerTool(
      'charger_search_nearby',
      {
        description: '캐시된 충전소 snapshot에서 위치와 freshness-aware 상태를 조회합니다',
        inputSchema: z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          radiusM: z.number().int().positive().max(50000).optional(),
          status: z.enum(['AVAILABLE', 'CHARGING', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN']).optional(),
          freshness: z.enum(['FRESH', 'STALE', 'UNKNOWN', 'ANY']).optional(),
          source: z.string().optional(),
          limit: z.number().int().positive().max(100).optional(),
          cursor: z.string().optional(),
          scope: CollectionScopeInputSchema.optional(),
        }),
      },
      async (args) => {
        try {
          const result = await this.chargerService.searchNearby(args)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }
        } catch (error) {
          return this.chargerErrorResult(error)
        }
      },
    )

    server.registerTool(
      'charger_scope_preview',
      {
        description: 'provider 호출 없이 충전소 collection scope와 예상 region 수를 확인합니다',
        inputSchema: z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          radiusM: z.number().int().positive().max(50000).optional(),
          scope: CollectionScopeInputSchema.optional(),
        }),
      },
      async (args) => {
        try {
          const result = await this.chargerService.previewScope(args)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }
        } catch (error) {
          return this.chargerErrorResult(error)
        }
      },
    )

    server.registerTool(
      'charger_status',
      {
        description: 'opaque stationId로 충전기 상태와 freshness를 조회합니다',
        inputSchema: z.object({
          stationId: z.string().min(1),
          chargerId: z.string().min(1).optional(),
          source: z.string().optional(),
        }),
      },
      async (args) => {
        try {
          const result = await this.chargerService.getStatus(args.stationId, args.chargerId)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }
        } catch (error) {
          return this.chargerErrorResult(error)
        }
      },
    )

    logger.info('Tools registered')
  }

  private chargerErrorResult(error: unknown): {
    content: [{ type: 'text'; text: string }]
    isError: true
  } {
    const code = error instanceof McpException ? error.code : 'INTERNAL_ERROR'
    const scope =
      typeof error === 'object' && error !== null && 'scope' in error
        ? (error as { scope?: unknown }).scope
        : undefined
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code,
              message:
                code === 'SNAPSHOT_UNAVAILABLE'
                  ? 'Charging snapshot is temporarily unavailable'
                  : code === 'COLLECTION_SCOPE_REQUIRED'
                    ? 'Charging collection scope is required'
                    : code === 'NATIONWIDE_NOT_ALLOWED'
                      ? 'Nationwide charging collection is not allowed'
                  : code === 'RATE_LIMITED'
                    ? 'Charging provider rate limit reached'
                    : code === 'NOT_FOUND'
                      ? 'The requested charging station was not found'
                      : 'Charging request failed',
            },
            ...(scope === undefined ? {} : { scope }),
          }),
        },
      ],
      isError: true,
    }
  }
}
