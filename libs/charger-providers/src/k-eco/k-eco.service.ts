import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import utc from 'dayjs/plugin/utc'
import { Injectable } from '@nestjs/common'
import { ChargerTelemetry } from 'zido/common'
import {
  ChargerInfoPageSchema,
  ChargerInfoQuerySchema,
  ChargerProviderCapabilitiesSchema,
  ChargerStatusPageSchema,
  ChargerStatusQuerySchema,
  type ChargerInfoPage,
  type ChargerInfoQuery,
  type ChargerInfoRecord,
  type ChargerProviderCapabilities,
  type ChargerProviderContract,
  type ChargerProviderScope,
  type ChargerStatusPage,
  type ChargerStatusQuery,
  type ChargerStatusRecord,
  type NormalizedChargerStatus,
} from '../charger-provider.contract'
import { KEcoAPIService } from './k-eco-api.service'
import type { ChargerInfoQuery as KEcoInfoQuery, ChargerStatusQuery as KEcoStatusQuery } from './contracts/request'
import type { KecoInfoItem, KecoStatusItem } from './contracts/response'
import { KecoException, KecoInternalException } from './k-eco.exception'
import { KEcoXmlParser } from './k-eco-xml-parser'

dayjs.extend(customParseFormat)
dayjs.extend(utc)

const KECO_DATETIME_FORMAT = 'YYYYMMDDHHmmss'
const KOREA_UTC_OFFSET_HOURS = 9

const PROVIDER_ID = 'keco' as const

const KECO_CAPABILITIES: ChargerProviderCapabilities = ChargerProviderCapabilitiesSchema.parse({
  scopes: ['NATIONWIDE', 'REGION'],
  pagination: ['PAGE'],
  status: 'DYNAMIC',
  connectorDetails: true,
  powerDetails: true,
  tariffs: false,
  limits: {
    pageSize: { min: 10, max: 9_999 },
    statusUpdatedWithinMinutes: { min: 1, max: 10 },
    radiusMetersMax: null,
  },
})

/**
 * KECO 원천 API를 provider 공통 계약으로 변환하는 adapter다.
 */
@Injectable()
export class KEcoService implements ChargerProviderContract {
  readonly providerId = PROVIDER_ID
  readonly capabilities = KECO_CAPABILITIES

  private readonly parser = new KEcoXmlParser()

  constructor(
    private readonly apiService: KEcoAPIService,
    private readonly telemetry: ChargerTelemetry = new ChargerTelemetry(),
  ) {}

  async fetchInfoPage(query: ChargerInfoQuery): Promise<ChargerInfoPage> {
    const parsedQuery = this.parseInfoQuery(query)
    const startedAt = Date.now()

    try {
      const xml = await this.apiService.getChargerInfo(parsedQuery)
      const sourcePage = this.parser.parseInfoPage(xml)
      const observedAt = new Date().toISOString()
      const page = ChargerInfoPageSchema.parse({
        ...this.pageMetadata(sourcePage, observedAt),
        items: sourcePage.items.map((item) => this.mapInfoItem(item)),
      })
      this.recordSuccess('/getChargerInfo', sourcePage.resultCode, page.items.length, startedAt)
      return page
    } catch (error) {
      this.recordFailure('/getChargerInfo', error, startedAt)
      throw error
    }
  }

  async fetchStatusPage(query: ChargerStatusQuery): Promise<ChargerStatusPage> {
    const parsedQuery = this.parseStatusQuery(query)
    const startedAt = Date.now()

    try {
      const xml = await this.apiService.getChargerStatus(parsedQuery)
      const sourcePage = this.parser.parseStatusPage(xml)
      const observedAt = new Date().toISOString()
      const page = ChargerStatusPageSchema.parse({
        ...this.pageMetadata(sourcePage, observedAt),
        items: sourcePage.items.map((item) => this.mapStatusItem(item, observedAt)),
      })
      this.recordSuccess('/getChargerStatus', sourcePage.resultCode, page.items.length, startedAt)
      return page
    } catch (error) {
      this.recordFailure('/getChargerStatus', error, startedAt)
      throw error
    }
  }

  private parseInfoQuery(query: ChargerInfoQuery): KEcoInfoQuery {
    const parsed = ChargerInfoQuerySchema.safeParse(query)
    if (!parsed.success) throw this.invalidQuery(parsed.error)
    return this.toKEcoQuery(parsed.data.scope, parsed.data.pagination)
  }

  private parseStatusQuery(query: ChargerStatusQuery): KEcoStatusQuery {
    const parsed = ChargerStatusQuerySchema.safeParse(query)
    if (!parsed.success) throw this.invalidQuery(parsed.error)
    return {
      ...this.toKEcoQuery(parsed.data.scope, parsed.data.pagination),
      period: parsed.data.updatedWithinMinutes,
    }
  }

  private toKEcoQuery(scope: ChargerProviderScope, pagination: ChargerInfoQuery['pagination']): KEcoInfoQuery {
    if (pagination.type !== 'PAGE') {
      throw this.invalidQuery(new Error('KECO does not support cursor pagination'))
    }
    if (scope.type === 'NATIONWIDE') {
      if (scope.countryCode.toUpperCase() !== 'KR') {
        throw this.invalidQuery(new Error('KECO supports South Korea only'))
      }
      return { pageNo: pagination.page, numOfRows: pagination.pageSize, nationwide: true }
    }
    if (scope.type === 'REGION') {
      if (scope.countryCode.toUpperCase() !== 'KR') {
        throw this.invalidQuery(new Error('KECO supports South Korea only'))
      }
      return {
        pageNo: pagination.page,
        numOfRows: pagination.pageSize,
        zcode: scope.regionCode,
        zscode: scope.subregionCode,
      }
    }
    throw this.invalidQuery(new Error(`KECO does not support ${scope.type} scope`))
  }

  private mapInfoItem(item: KecoInfoItem): ChargerInfoRecord {
    const maxPowerKw = numericValue(item.output)
    return {
      providerId: this.providerId,
      operatorId: item.busiId,
      operatorName: textValue(item.busiNm ?? item.bnm),
      stationId: requiredIdentity(item.statId, 'statId'),
      chargerId: requiredIdentity(item.chgerId, 'chgerId'),
      name: textValue(item.statNm),
      address: textValue(item.addr ?? item.address),
      addressDetail: textValue(item.addrDetail ?? item.detail ?? item.location),
      location: coordinates(item.lat, item.lng),
      access: item.limitYn === 'Y' ? 'RESTRICTED' : item.limitYn === 'N' ? 'PUBLIC' : 'UNKNOWN',
      operatingHours: textValue(item.useTime),
      connectors: item.chgerType ? [{ type: `KECO:${item.chgerType}`, maxPowerKw, count: 1 }] : [],
    }
  }

  private mapStatusItem(item: KecoStatusItem, observedAt: string): ChargerStatusRecord {
    const status = normalizeStatus(item.stat)
    return {
      providerId: this.providerId,
      operatorId: item.busiId,
      stationId: requiredIdentity(item.statId, 'statId'),
      chargerId: requiredIdentity(item.chgerId, 'chgerId'),
      status,
      rawStatus: item.stat,
      statusUpdatedAt: parseKEcoDateTime(item.statUpdDt),
      observedAt,
      availableCount: status === 'UNKNOWN' ? null : status === 'AVAILABLE' ? 1 : 0,
      outOfServiceCount: status === 'UNKNOWN' ? null : status === 'OUT_OF_SERVICE' || status === 'MAINTENANCE' ? 1 : 0,
      totalCount: 1,
    }
  }

  private pageMetadata(
    page: { resultCode: string; resultMsg: string; pageNo: number; numOfRows: number; totalCount: number },
    observedAt: string,
  ) {
    return {
      providerId: this.providerId,
      page: page.pageNo,
      pageSize: page.numOfRows,
      totalCount: page.totalCount,
      nextCursor: null,
      hasNext: page.pageNo * page.numOfRows < page.totalCount,
      observedAt,
      providerMetadata: { resultCode: page.resultCode, resultMsg: page.resultMsg },
    }
  }

  private invalidQuery(cause: unknown): KecoInternalException {
    return new KecoInternalException('Invalid KECO provider query', {
      failureKind: 'INVALID_REQUEST',
      cause,
    })
  }

  private recordSuccess(endpoint: string, resultCode: string, itemCount: number, startedAt: number): void {
    this.telemetry.record({
      provider: this.providerId,
      endpoint,
      resultCode,
      httpStatus: 200,
      latencyMs: Date.now() - startedAt,
      itemCount,
      retryCount: 0,
      quotaState: 'OK',
    })
  }

  private recordFailure(endpoint: string, error: unknown, startedAt: number): void {
    const providerError = error instanceof KecoException ? error : undefined
    const quotaState =
      providerError?.failureKind === 'QUOTA_EXHAUSTED'
        ? 'EXHAUSTED'
        : providerError?.failureKind === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : 'ERROR'
    this.telemetry.record({
      provider: this.providerId,
      endpoint,
      resultCode: providerError?.resultCode ?? 'ERROR',
      httpStatus: providerError?.getStatus(),
      latencyMs: Date.now() - startedAt,
      itemCount: 0,
      retryCount: 0,
      quotaState,
    })
  }
}

function requiredIdentity(value: string | null, field: string): string {
  if (value) return value
  throw new KecoInternalException(`KECO ${field} is missing after response validation`, {
    failureKind: 'INVALID_REQUEST',
  })
}

function textValue(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function numericValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function coordinates(
  latValue: string | number | null | undefined,
  lngValue: string | number | null | undefined,
): { lat: number; lng: number } | null {
  const lat = numericValue(latValue)
  const lng = numericValue(lngValue)
  if (lat === null || lng === null || lat > 90 || lng > 180) return null
  return { lat, lng }
}

function normalizeStatus(status: string | null): NormalizedChargerStatus {
  switch (status) {
    case '2':
      return 'AVAILABLE'
    case '3':
      return 'CHARGING'
    case '5':
      return 'MAINTENANCE'
    case '1':
    case '4':
      return 'OUT_OF_SERVICE'
    default:
      return 'UNKNOWN'
  }
}

function parseKEcoDateTime(value: string | null): string | null {
  if (!value) return null
  const parsed = dayjs(value, KECO_DATETIME_FORMAT, true)
  if (!parsed.isValid()) return null
  return parsed.utcOffset(KOREA_UTC_OFFSET_HOURS, true).utc().toISOString()
}
