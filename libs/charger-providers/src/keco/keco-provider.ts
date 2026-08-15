import { Injectable } from '@nestjs/common'
import type {
  ChargerInfoQuery,
  ChargerStatusQuery,
  IKecoProvider,
  KecoInfoItem,
  KecoProviderOptions,
  KecoStatusItem,
  ProviderPage,
} from './keco-contracts'
import { KecoProviderError, createKecoHttpError } from './keco-errors'
import { buildInfoUrl, buildStatusUrl, validateChargerInfoQuery, validateChargerStatusQuery } from './keco-query'
import { redactSensitiveText } from './keco-redact'
import { KecoXmlParser } from './keco-xml-parser'

/**
 * Default API endpoint and timeout configuration
 */
const DEFAULT_ENDPOINT = 'https://apis.data.go.kr/B552584/EvCharger'
const DEFAULT_TIMEOUT_MS = 8000

/**
 * KECO EvCharger API Provider.
 * Read-only provider adapter that fetches live status and info pages from KECO OpenAPI.
 */
@Injectable()
export class KecoProvider implements IKecoProvider {
  private readonly endpoint: string
  private readonly serviceKey: string
  private readonly timeoutMs: number
  private readonly fetchFn: typeof globalThis.fetch
  private readonly parser: KecoXmlParser
  private readonly telemetry?: KecoProviderOptions['telemetry']

  constructor(options: KecoProviderOptions) {
    if (!options?.serviceKey || !options.serviceKey.trim()) {
      throw new KecoProviderError('KECO serviceKey is required and cannot be empty.', {
        failureKind: 'AUTHENTICATION',
        retryable: false,
      })
    }
    this.serviceKey = options?.serviceKey?.trim() ?? ''
    const rawEndpoint = (options.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '')

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
    const isExplicitLocalAdapter =
      !isHttps && isLocalhost && options.fetch !== undefined && options.allowInsecureHttp === true

    if (!isHttps && !isExplicitLocalAdapter) {
      throw new KecoProviderError('KECO endpoint must use HTTPS for remote endpoints to prevent credential leakage.', {
        failureKind: 'INVALID_REQUEST',
        retryable: false,
      })
    }

    this.endpoint = rawEndpoint
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.parser = new KecoXmlParser()
    this.telemetry = options.telemetry
  }

  /**
   * Fetches a paginated charger status page from KECO getChargerStatus API.
   */
  public async fetchStatusPage(query?: ChargerStatusQuery): Promise<ProviderPage<KecoStatusItem>> {
    this.assertConfigured()
    const validated = validateChargerStatusQuery(query)
    const url = buildStatusUrl(this.endpoint, this.serviceKey, validated)
    const startedAt = Date.now()
    try {
      const xml = await this.executeFetch(url)
      const page = this.parser.parseStatusPage(xml)
      this.telemetry?.record({
        provider: 'keco',
        endpoint: '/getChargerStatus',
        resultCode: page.resultCode,
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
        itemCount: page.items.length,
        retryCount: 0,
        quotaState: page.resultCode === '22' ? 'EXHAUSTED' : page.resultCode === '23' ? 'RATE_LIMITED' : 'OK',
      })
      return page
    } catch (error) {
      const httpStatus = error instanceof KecoProviderError ? error.statusCode : undefined
      const resultCode =
        error instanceof KecoProviderError
          ? (error.resultCode ?? (httpStatus ? `HTTP_${httpStatus}` : 'ERROR'))
          : 'ERROR'
      const quotaState =
        error instanceof KecoProviderError
          ? error.failureKind === 'QUOTA_EXHAUSTED'
            ? 'EXHAUSTED'
            : error.failureKind === 'RATE_LIMITED'
              ? 'RATE_LIMITED'
              : 'ERROR'
          : 'ERROR'

      this.telemetry?.record({
        provider: 'keco',
        endpoint: '/getChargerStatus',
        resultCode,
        httpStatus,
        latencyMs: Date.now() - startedAt,
        itemCount: 0,
        retryCount: 0,
        quotaState,
      })
      throw error
    }
  }

  /**
   * Fetches a paginated charger info page from KECO getChargerInfo API.
   */
  public async fetchInfoPage(query?: ChargerInfoQuery): Promise<ProviderPage<KecoInfoItem>> {
    this.assertConfigured()
    const validated = validateChargerInfoQuery(query)
    const url = buildInfoUrl(this.endpoint, this.serviceKey, validated)
    const startedAt = Date.now()
    try {
      const xml = await this.executeFetch(url)
      const page = this.parser.parseInfoPage(xml)
      this.telemetry?.record({
        provider: 'keco',
        endpoint: '/getChargerInfo',
        resultCode: page.resultCode,
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
        itemCount: page.items.length,
        retryCount: 0,
        quotaState: page.resultCode === '22' ? 'EXHAUSTED' : page.resultCode === '23' ? 'RATE_LIMITED' : 'OK',
      })
      return page
    } catch (error) {
      const httpStatus = error instanceof KecoProviderError ? error.statusCode : undefined
      const resultCode =
        error instanceof KecoProviderError
          ? (error.resultCode ?? (httpStatus ? `HTTP_${httpStatus}` : 'ERROR'))
          : 'ERROR'
      const quotaState =
        error instanceof KecoProviderError
          ? error.failureKind === 'QUOTA_EXHAUSTED'
            ? 'EXHAUSTED'
            : error.failureKind === 'RATE_LIMITED'
              ? 'RATE_LIMITED'
              : 'ERROR'
          : 'ERROR'

      this.telemetry?.record({
        provider: 'keco',
        endpoint: '/getChargerInfo',
        resultCode,
        httpStatus,
        latencyMs: Date.now() - startedAt,
        itemCount: 0,
        retryCount: 0,
        quotaState,
      })
      throw error
    }
  }

  /**
   * Executes HTTP GET request with timeout, error redaction, and response decoding.
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

  private assertConfigured(): void {
    if (!this.serviceKey || this.serviceKey === '__UNCONFIGURED__') {
      throw new KecoProviderError('KECO provider credentials are not configured', {
        failureKind: 'AUTHENTICATION',
        retryable: false,
      })
    }
  }
}
