import { HttpException, HttpStatus } from '@nestjs/common'
import type { KecoFailureKind } from './contracts/typed'
import { classifyKecoResultCode } from './contracts/result-codes'

/**
 * Exception 생성 위치 구분
 */
export type KecoExceptionOrigin = 'INTERNAL' | 'UPSTREAM_PROVIDER'

/**
 * 내부 validation에서 허용하는 failure kind
 */
export type KecoInternalFailureKind = Extract<KecoFailureKind, 'AUTHENTICATION' | 'INVALID_REQUEST'>

/**
 * 내부 validation 오류 생성 option
 */
export interface KecoInternalExceptionOptions {
  failureKind: KecoInternalFailureKind
  cause?: unknown
}

/**
 * 업스트림 provider 오류 생성 option
 */
export interface KecoUpstreamProviderExceptionOptions {
  failureKind: KecoFailureKind
  retryable: boolean
  upstreamStatusCode?: number
  resultCode?: string
  rawResultMsg?: string
  cause?: unknown
}

/**
 * Provider failure별 public HTTP status mapping
 */
const FAILURE_HTTP_STATUS: Record<KecoFailureKind, number> = {
  TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  QUOTA_EXHAUSTED: HttpStatus.TOO_MANY_REQUESTS,
  AUTHENTICATION: HttpStatus.UNAUTHORIZED,
  INVALID_REQUEST: HttpStatus.BAD_REQUEST,
  CONTRACT_CHANGED: HttpStatus.BAD_GATEWAY,
  BLOCKED_NETWORK: HttpStatus.FORBIDDEN,
  UPSTREAM_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
}

/**
 * 공통 exception constructor 입력
 */
interface KecoExceptionOptions {
  origin: KecoExceptionOrigin
  failureKind: KecoFailureKind
  retryable: boolean
  upstreamStatusCode?: number
  resultCode?: string
  rawResultMsg?: string
  cause?: unknown
}

/**
 * KECO exception의 공통 public 계약과 redaction 경계
 */
export abstract class KecoException extends HttpException {
  readonly origin: KecoExceptionOrigin
  readonly failureKind: KecoFailureKind
  readonly retryable: boolean
  readonly upstreamStatusCode?: number
  readonly resultCode?: string
  readonly rawResultMsg?: string
  override readonly cause: Error | undefined

  protected constructor(message: string, options: KecoExceptionOptions) {
    const safeMessage = sanitizeErrorText(message)
    const safeRawResultMsg = options.rawResultMsg ? sanitizeErrorText(options.rawResultMsg) : undefined
    const httpStatus = FAILURE_HTTP_STATUS[options.failureKind]
    super(
      {
        message: safeMessage,
        origin: options.origin,
        failureKind: options.failureKind,
        retryable: options.retryable,
        upstreamStatusCode: options.upstreamStatusCode,
        resultCode: options.resultCode,
        rawResultMsg: safeRawResultMsg,
      },
      httpStatus,
    )
    this.origin = options.origin
    this.failureKind = options.failureKind
    this.retryable = options.retryable
    this.upstreamStatusCode = options.upstreamStatusCode
    this.resultCode = options.resultCode
    this.rawResultMsg = safeRawResultMsg
    this.cause = sanitizeCause(options.cause)
  }
}

/**
 * 설정과 요청 validation 과정에서 service가 생성한 내부 오류
 */
export class KecoInternalException extends KecoException {
  constructor(message: string, options: KecoInternalExceptionOptions) {
    super(message, {
      origin: 'INTERNAL',
      failureKind: options.failureKind,
      retryable: false,
      cause: options.cause,
    })
  }
}

/**
 * KECO 또는 외부 transport 경계에서 발생한 업스트림 provider 오류
 */
export class KecoUpstreamProviderException extends KecoException {
  constructor(message: string, options: KecoUpstreamProviderExceptionOptions) {
    super(message, {
      origin: 'UPSTREAM_PROVIDER',
      failureKind: options.failureKind,
      retryable: options.retryable,
      upstreamStatusCode: options.upstreamStatusCode,
      resultCode: options.resultCode,
      rawResultMsg: options.rawResultMsg,
      cause: options.cause,
    })
  }
}

/**
 * KECO XML header result code 기반 업스트림 provider 오류 변환
 */
export function createKecoErrorFromResultCode(resultCode: string, resultMsg?: string): KecoUpstreamProviderException {
  const classification = classifyKecoResultCode(resultCode)
  const description = resultMsg || classification.description
  return new KecoUpstreamProviderException(`KECO API returned error code ${resultCode}: ${description}`, {
    failureKind: classification.failureKind ?? 'UPSTREAM_UNAVAILABLE',
    retryable: classification.retryable,
    resultCode,
    rawResultMsg: resultMsg,
  })
}

/**
 * HTTP status 기반 업스트림 provider 오류 변환
 */
export function createKecoHttpError(statusCode: number): KecoUpstreamProviderException {
  if (statusCode === HttpStatus.UNAUTHORIZED) {
    return new KecoUpstreamProviderException('KECO authentication failed', {
      failureKind: 'AUTHENTICATION',
      retryable: false,
      upstreamStatusCode: statusCode,
    })
  }
  if (statusCode === HttpStatus.FORBIDDEN) {
    return new KecoUpstreamProviderException('KECO network access was blocked', {
      failureKind: 'BLOCKED_NETWORK',
      retryable: false,
      upstreamStatusCode: statusCode,
    })
  }
  if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
    return new KecoUpstreamProviderException('KECO rate limit exceeded', {
      failureKind: 'RATE_LIMITED',
      retryable: true,
      upstreamStatusCode: statusCode,
    })
  }
  if (statusCode === HttpStatus.REQUEST_TIMEOUT || statusCode === HttpStatus.GATEWAY_TIMEOUT) {
    return new KecoUpstreamProviderException('KECO gateway timed out', {
      failureKind: 'TIMEOUT',
      retryable: true,
      upstreamStatusCode: statusCode,
    })
  }
  if (statusCode === HttpStatus.BAD_REQUEST) {
    return new KecoUpstreamProviderException('KECO request was rejected', {
      failureKind: 'INVALID_REQUEST',
      retryable: false,
      upstreamStatusCode: statusCode,
    })
  }
  if (statusCode === HttpStatus.NOT_FOUND) {
    return new KecoUpstreamProviderException('KECO endpoint contract changed', {
      failureKind: 'CONTRACT_CHANGED',
      retryable: false,
      upstreamStatusCode: statusCode,
    })
  }
  return new KecoUpstreamProviderException('KECO upstream is unavailable', {
    failureKind: 'UPSTREAM_UNAVAILABLE',
    retryable: statusCode >= 500,
    upstreamStatusCode: statusCode,
  })
}

/**
 * timeout 계열 오류 판별
 */
export function isKecoTimeoutError(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')
}

/**
 * 외부 URL query와 인증값 제거
 */
function sanitizeErrorText(value: string): string {
  return value
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]*/gi, '$1')
    .replace(/(service[\s_-]?key|authorization)(?:%3d|\s*[=:]\s*)[^\s&,]*/gi, '$1=[REDACTED]')
}

/**
 * 외부 오류 원문을 제외한 안전한 cause 생성
 */
function sanitizeCause(cause: unknown): Error | undefined {
  if (!(cause instanceof Error)) return undefined
  const safeCause = new Error('KECO transport failure')
  safeCause.name = cause.name === 'AbortError' || cause.name === 'TimeoutError' ? cause.name : 'KecoTransportError'
  return safeCause
}
