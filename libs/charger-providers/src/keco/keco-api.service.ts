import { Injectable } from '@nestjs/common'
import type { KecoAPIServiceOptions, ValidatedInfoQuery, ValidatedStatusQuery } from './types'
import { KecoProviderError, createKecoHttpError } from './keco.exception'
import { buildInfoUrl, buildStatusUrl } from './keco-query'
import { redactSensitiveText } from './keco-redact'

/**
 * KECO OpenAPI HTTP 원본 연동을 전담하는 API 서비스 인터페이스.
 */
export interface IKecoAPIService {
  /**
   * 충전기 실시간 상태 API에 요청을 전송하고 원본 XML 문자열을 수신한다.
   *
   * @param query 검증된 상태 조회 파라미터
   * @returns 원본 응답 XML 문자열 프로미스
   */
  getChargerStatus(query: ValidatedStatusQuery): Promise<string>

  /**
   * 충전소/충전기 기본 정보 API에 요청을 전송하고 원본 XML 문자열을 수신한다.
   *
   * @param query 검증된 정보 조회 파라미터
   * @returns 원본 응답 XML 문자열 프로미스
   */
  getChargerInfo(query: ValidatedInfoQuery): Promise<string>
}

/**
 * KECO OpenAPI HTTP 통신 레이어 서비스.
 * 엔드포인트 연결, URL 조립, 타임아웃, 헤더 설정, HTTP 상태 코드 매핑, 원본 텍스트 수신만을 책임진다.
 */
@Injectable()
export class KecoAPIService implements IKecoAPIService {
  private readonly endpoint: string
  private readonly serviceKey: string
  private readonly timeoutMs: number
  private readonly fetchFn: typeof globalThis.fetch

  constructor(options: KecoAPIServiceOptions) {
    if (!options?.serviceKey || !options.serviceKey.trim()) {
      throw new KecoProviderError('KECO serviceKey is required and cannot be empty.', {
        failureKind: 'AUTHENTICATION',
        retryable: false,
      })
    }
    this.serviceKey = options.serviceKey.trim()

    const rawEndpoint = (options.endpoint ?? '').replace(/\/+$/, '')
    let parsedUrl: URL
    try {
      parsedUrl = new URL(rawEndpoint)
    } catch {
      throw new KecoProviderError(`Invalid KECO endpoint URL: ${redactSensitiveText(rawEndpoint)}`, {
        failureKind: 'INVALID_REQUEST',
        retryable: false,
      })
    }

    const isHttps = parsedUrl.protocol === 'https:'
    const isLocalhost =
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === '::1' ||
      parsedUrl.hostname === '[::1]'
    const hasInjectedFetch = options.fetchFn !== undefined || options.fetch !== undefined
    const isExplicitLocalAdapter =
      !isHttps && isLocalhost && hasInjectedFetch && options.allowInsecureHttp === true

    if (!isHttps && !isExplicitLocalAdapter) {
      throw new KecoProviderError('KECO endpoint must use HTTPS for remote endpoints to prevent credential leakage.', {
        failureKind: 'INVALID_REQUEST',
        retryable: false,
      })
    }

    this.endpoint = rawEndpoint
    this.timeoutMs = options.timeoutMs
    this.fetchFn = options.fetchFn ?? options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  /**
   * 충전기 실시간 상태 API에 요청을 전송하고 원본 XML 문자열을 수신한다.
   *
   * @param query 검증된 상태 조회 파라미터
   * @returns 원본 응답 XML 문자열
   */
  public async getChargerStatus(query: ValidatedStatusQuery): Promise<string> {
    this.assertConfigured()
    const url = buildStatusUrl(this.endpoint, this.serviceKey, query)
    return this.executeFetch(url)
  }

  /**
   * 충전소/충전기 기본 정보 API에 요청을 전송하고 원본 XML 문자열을 수신한다.
   *
   * @param query 검증된 정보 조회 파라미터
   * @returns 원본 응답 XML 문자열
   */
  public async getChargerInfo(query: ValidatedInfoQuery): Promise<string> {
    this.assertConfigured()
    const url = buildInfoUrl(this.endpoint, this.serviceKey, query)
    return this.executeFetch(url)
  }

  /**
   * 타임아웃, 에러 마스킹, 응답 디코딩을 적용하여 HTTP GET 요청을 실행한다.
   *
   * @param url 요청 URL 문자열
   * @returns 응답 바디 텍스트 문자열
   */
  private async executeFetch(url: string): Promise<string> {
    let response: Response
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: 'application/xml, text/xml, */*',
        },
      })
    } catch (err: unknown) {
      if (err instanceof KecoProviderError) {
        throw err
      }

      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new KecoProviderError(`KECO request timed out after ${this.timeoutMs}ms`, {
          failureKind: 'TIMEOUT',
          retryable: true,
          cause: err,
        })
      }

      const rawMsg = err instanceof Error ? err.message : String(err)
      throw new KecoProviderError(
        `KECO network request failed: ${redactSensitiveText(rawMsg, { stripQueries: true })}`,
        {
          failureKind: 'UPSTREAM_UNAVAILABLE',
          retryable: true,
          cause: err instanceof Error ? err : undefined,
        },
      )
    }

    if (!response.ok) {
      throw createKecoHttpError(response.status, response.statusText)
    }

    try {
      return await response.text()
    } catch (err: unknown) {
      throw new KecoProviderError('Failed to read response body from KECO API', {
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        cause: err instanceof Error ? err : undefined,
      })
    }
  }

  /**
   * API 자격증명이 올바르게 구성되어 있는지 확인한다.
   */
  private assertConfigured(): void {
    if (!this.serviceKey || this.serviceKey === '__UNCONFIGURED__') {
      throw new KecoProviderError('KECO provider credentials are not configured', {
        failureKind: 'AUTHENTICATION',
        retryable: false,
      })
    }
  }
}
