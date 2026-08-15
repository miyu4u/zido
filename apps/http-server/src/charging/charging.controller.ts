import { Controller, Get, Headers, Param, Query, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { createHash, randomUUID } from 'node:crypto'
import { McpException } from 'zido/common'
import {
  ChargerService,
  type ChargerSearchQuery,
  type ChargerStatusFilter,
  type ChargingStationResult,
} from 'zido/charger-domain'

const STATUS_VALUES = new Set<ChargerStatusFilter>([
  'AVAILABLE',
  'CHARGING',
  'UNAVAILABLE',
  'MAINTENANCE',
  'UNKNOWN',
])
const FRESHNESS_VALUES = new Set(['FRESH', 'STALE', 'UNKNOWN', 'ANY'])

@Controller('v1/charging-stations')
export class ChargingController {
  constructor(private readonly chargerService: ChargerService) {}

  @Get()
  async search(
    @Query() query: Record<string, string | undefined>,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const requestId = this.requestId(requestIdHeader)
    this.setRequestHeaders(response, requestId)
    try {
      const input = this.parseSearchQuery(query)
      const result = await this.chargerService.searchNearby(input)
      const body = {
        data: {
          items: result.items,
          nextCursor: result.nextCursor,
          matchedCount: result.matchedCount,
        },
        meta: {
          requestId,
          generatedAt: new Date().toISOString(),
          dataAsOf: result.dataAsOf,
        },
        sourceSummary: result.sourceSummary,
      }
      this.setCacheHeaders(response, body)
      return body
    } catch (error) {
      return this.errorResponse(error, requestId, response)
    }
  }

  @Get(':stationId')
  async detail(
    @Param('stationId') stationId: string,
    @Query('chargerId') chargerId: string | undefined,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const requestId = this.requestId(requestIdHeader)
    this.setRequestHeaders(response, requestId)
    try {
      const station = await this.chargerService.getStatus(decodeURIComponent(stationId), chargerId)
      const body = {
        data: station,
        meta: {
          requestId,
          generatedAt: new Date().toISOString(),
          dataAsOf: station.sourceObservedAt,
        },
        sourceSummary: [
          {
            source: station.source,
            lastSuccessfulObservedAt: station.sourceObservedAt,
            freshness: this.sourceFreshness(station),
            itemCount: station.chargers.length,
          },
        ],
      }
      this.setCacheHeaders(response, body)
      return body
    } catch (error) {
      return this.errorResponse(error, requestId, response)
    }
  }

  private parseSearchQuery(query: Record<string, string | undefined>): ChargerSearchQuery {
    const lat = this.number(query.lat, 'lat')
    const lng = this.number(query.lng, 'lng')
    const radiusM = query.radiusM === undefined ? undefined : this.integer(query.radiusM, 'radiusM')
    const limit = query.limit === undefined ? undefined : this.integer(query.limit, 'limit')
    const status = query.status as ChargerStatusFilter | undefined
    if (status && !STATUS_VALUES.has(status)) throw new McpException('Invalid status', 'INVALID_ARGUMENT', 400)
    const freshness = query.freshness
    if (freshness && !FRESHNESS_VALUES.has(freshness)) {
      throw new McpException('Invalid freshness', 'INVALID_ARGUMENT', 400)
    }
    if (query.source && query.source !== 'keco') {
      throw new McpException('Invalid source', 'INVALID_ARGUMENT', 400)
    }
    return {
      lat,
      lng,
      radiusM,
      limit,
      cursor: query.cursor,
      status,
      freshness: freshness as ChargerSearchQuery['freshness'],
      source: query.source as ChargerSearchQuery['source'],
    }
  }

  private number(value: string | undefined, field: string): number {
    if (value === undefined || value.trim() === '') throw new McpException(`Missing ${field}`, 'INVALID_ARGUMENT', 400)
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) throw new McpException(`Invalid ${field}`, 'INVALID_ARGUMENT', 400)
    return parsed
  }

  private integer(value: string, field: string): number {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) throw new McpException(`Invalid ${field}`, 'INVALID_ARGUMENT', 400)
    return parsed
  }

  private errorResponse(error: unknown, requestId: string, response: Response) {
    const code = error instanceof McpException ? error.code : 'INTERNAL_ERROR'
    const status = this.errorStatus(code)
    response.status(status)
    return {
      error: {
        code,
        message: this.publicMessage(code),
        retryable: code === 'SNAPSHOT_UNAVAILABLE' || code === 'RATE_LIMITED',
      },
      meta: { requestId },
    }
  }

  private publicMessage(code: string): string {
    switch (code) {
      case 'INVALID_ARGUMENT':
        return 'The request contains an invalid argument'
      case 'INVALID_CURSOR':
        return 'The cursor is invalid or expired'
      case 'NOT_FOUND':
        return 'The requested charging station was not found'
      case 'SNAPSHOT_UNAVAILABLE':
        return 'Charging snapshot is temporarily unavailable'
      case 'RATE_LIMITED':
        return 'Charging provider rate limit reached'
      default:
        return 'Internal charging service error'
    }
  }

  private errorStatus(code: string): number {
    if (code === 'INVALID_ARGUMENT' || code === 'INVALID_CURSOR') return 400
    if (code === 'NOT_FOUND') return 404
    if (code === 'RATE_LIMITED') return 429
    if (code === 'SNAPSHOT_UNAVAILABLE') return 503
    return 500
  }

  private sourceFreshness(station: ChargingStationResult): 'FRESH' | 'STALE' | 'UNKNOWN' {
    if (station.chargers.some((charger) => charger.freshness === 'FRESH')) return 'FRESH'
    if (station.chargers.some((charger) => charger.freshness === 'STALE')) return 'STALE'
    return 'UNKNOWN'
  }

  private requestId(header: string | undefined): string {
    return header && /^[A-Za-z0-9._-]{1,100}$/.test(header) ? header : `req_${randomUUID()}`
  }

  private setRequestHeaders(response: Response, requestId: string): void {
    response.setHeader('X-Request-Id', requestId)
    response.setHeader('Vary', 'Accept, Accept-Encoding')
  }

  private setCacheHeaders(response: Response, body: unknown): void {
    const etag = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    response.setHeader('ETag', `"snapshot-${etag}"`)
    response.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  }
}
