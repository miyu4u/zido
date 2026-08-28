import { Injectable } from '@nestjs/common'
import type {
  ChargerInfoQuery,
  ChargerStatusQuery,
  ValidatedInfoQuery,
  ValidatedStatusQuery,
} from './contracts/request'
import { ValidatedInfoQuerySchema, ValidatedStatusQuerySchema } from './contracts/request'
import {
  createKecoHttpError,
  isKecoTimeoutError,
  KecoException,
  KecoInternalException,
  KecoUpstreamProviderException,
} from './k-eco.exception'

/**
 * KECO API service 생성 설정
 */
export interface KEcoAPIServiceConfig {
  /**
   * 공공데이터포털에서 발급한 service key
   */
  serviceKey: string
  /**
   * EvCharger service base URL
   */
  endpoint: string
  /**
   * 외부 요청 제한 시간(ms)
   */
  timeoutMs: number
}

/**
 * KECO API transport가 제공하는 read-only operation
 */
interface KEcoAPIServiceContract {
  getChargerStatus(query: ChargerStatusQuery): Promise<string>
  getChargerInfo(query: ChargerInfoQuery): Promise<string>
}

/**
 * JavaScript timer가 안전하게 표현하는 최대 timeout
 */
const MAX_TIMER_TIMEOUT_MS = 2_147_483_647

/**
 * KECO OpenAPI의 HTTP transport adapter
 */
@Injectable()
export class KEcoAPIService implements KEcoAPIServiceContract {
  private readonly http = globalThis.fetch
  private readonly serviceKey: string
  private readonly endpoint: string
  private readonly timeoutMs: number

  constructor(config: KEcoAPIServiceConfig) {
    this.serviceKey = config.serviceKey.trim()
    if (!this.serviceKey) {
      throw new KecoInternalException('KECO service key is not configured', {
        failureKind: 'AUTHENTICATION',
      })
    }

    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0 || config.timeoutMs > MAX_TIMER_TIMEOUT_MS) {
      throw new KecoInternalException('KECO timeout is outside the supported range', {
        failureKind: 'INVALID_REQUEST',
      })
    }

    this.endpoint = validateEndpoint(config)
    this.timeoutMs = config.timeoutMs
  }

  /**
   * 최근 충전기 상태 변경 page 조회
   */
  async getChargerStatus(query: ChargerStatusQuery): Promise<string> {
    const validated = this.validateStatusQuery(query)
    return this.request('/getChargerStatus', validated)
  }

  /**
   * 충전소·충전기 기본 정보 page 조회
   */
  async getChargerInfo(query: ChargerInfoQuery): Promise<string> {
    const validated = this.validateInfoQuery(query)
    return this.request('/getChargerInfo', validated)
  }

  /**
   * 명시적 수집 범위와 상태 조회 경계 검증
   */
  private validateStatusQuery(query: ChargerStatusQuery): ValidatedStatusQuery {
    const parsed = ValidatedStatusQuerySchema.safeParse(query)
    if (!parsed.success || !hasExplicitScope(parsed.success ? parsed.data : query)) {
      throw new KecoInternalException('Invalid KECO status query', {
        failureKind: 'INVALID_REQUEST',
      })
    }
    return parsed.data
  }

  /**
   * 명시적 수집 범위와 정보 조회 경계 검증
   */
  private validateInfoQuery(query: ChargerInfoQuery): ValidatedInfoQuery {
    const parsed = ValidatedInfoQuerySchema.safeParse(query)
    if (!parsed.success || !hasExplicitScope(parsed.success ? parsed.data : query)) {
      throw new KecoInternalException('Invalid KECO info query', {
        failureKind: 'INVALID_REQUEST',
      })
    }
    return parsed.data
  }

  /**
   * GET 요청과 timeout lifecycle 처리
   */
  private async request(
    operation: '/getChargerStatus' | '/getChargerInfo',
    query: ValidatedStatusQuery | ValidatedInfoQuery,
  ): Promise<string> {
    const url = this.buildUrl(operation, query)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.http(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/xml, text/xml, */*',
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw createKecoHttpError(response.status)
      }

      try {
        return await response.text()
      } catch (cause) {
        if (controller.signal.aborted || isKecoTimeoutError(cause)) {
          throw new KecoUpstreamProviderException(`KECO ${operation} response timed out`, {
            failureKind: 'TIMEOUT',
            retryable: true,
            cause,
          })
        }
        throw new KecoUpstreamProviderException(`Unable to read KECO ${operation} response`, {
          failureKind: 'UPSTREAM_UNAVAILABLE',
          retryable: true,
          upstreamStatusCode: response.status,
          cause,
        })
      }
    } catch (cause) {
      if (cause instanceof KecoException) throw cause
      if (controller.signal.aborted || isKecoTimeoutError(cause)) {
        throw new KecoUpstreamProviderException(`KECO ${operation} request timed out`, {
          failureKind: 'TIMEOUT',
          retryable: true,
          cause,
        })
      }
      throw new KecoUpstreamProviderException(`KECO ${operation} request failed`, {
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        cause,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * 인증값과 검증된 query를 포함하는 외부 요청 URL 생성
   */
  private buildUrl(
    operation: '/getChargerStatus' | '/getChargerInfo',
    query: ValidatedStatusQuery | ValidatedInfoQuery,
  ): string {
    const url = new URL(`${this.endpoint}${operation}`)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('pageNo', String(query.pageNo))
    url.searchParams.set('numOfRows', String(query.numOfRows))
    url.searchParams.set('dataType', 'XML')

    if ('period' in query) url.searchParams.set('period', String(query.period))
    if (query.zcode) url.searchParams.set('zcode', query.zcode)
    if (query.zscode) url.searchParams.set('zscode', query.zscode)
    if (query.kind) url.searchParams.set('kind', query.kind)
    if (query.kindDetail) url.searchParams.set('kindDetail', query.kindDetail)
    if (query.statId) url.searchParams.set('statId', query.statId)
    if (query.chgerId) url.searchParams.set('chgerId', query.chgerId)

    return url.toString()
  }
}

/**
 * production HTTPS endpoint 검증
 */
function validateEndpoint(config: KEcoAPIServiceConfig): string {
  let endpoint: URL
  try {
    endpoint = new URL(config.endpoint)
  } catch {
    throw new KecoInternalException('KECO endpoint is invalid', {
      failureKind: 'INVALID_REQUEST',
    })
  }

  if (endpoint.protocol !== 'https:') {
    throw new KecoInternalException('KECO endpoint must use HTTPS', {
      failureKind: 'INVALID_REQUEST',
    })
  }

  if (endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
    throw new KecoInternalException('KECO endpoint must be a credential-free base URL', {
      failureKind: 'INVALID_REQUEST',
    })
  }

  return endpoint.toString().replace(/\/+$/, '')
}

/**
 * 지역 코드 또는 전국 조회 승인 확인
 */
function hasExplicitScope(query: { zcode?: string; zscode?: string; nationwide?: true }): boolean {
  const hasRegionalScope = query.zcode !== undefined || query.zscode !== undefined
  return hasRegionalScope !== (query.nationwide === true)
}
