import { HttpException, HttpStatus } from '@nestjs/common'
import type { KecoFailureKind, KecoResultCode } from './types'
import { classifyKecoResultCode } from './types'
import { redactSensitiveText } from './keco-redact'

/**
 * KECO 공급자 오류 생성 옵션 인터페이스.
 */
export interface KecoProviderErrorOptions {
  /**
   * 오류 분류 유형 (예: 'TIMEOUT', 'AUTHENTICATION' 등)
   */
  failureKind: KecoFailureKind
  /**
   * 일시적 오류로서 재시도 가능 여부
   */
  retryable?: boolean
  /**
   * KECO 응답 결과 코드 (있는 경우)
   */
  resultCode?: KecoResultCode
  /**
   * HTTP 상태 코드 (있는 경우)
   */
  statusCode?: number
  /**
   * 원본 응답 메시지 (마스킹 처리됨)
   */
  rawResultMsg?: string
  /**
   * 원인 예외 객체
   */
  cause?: unknown
}

function mapFailureKindToHttpStatus(failureKind: KecoFailureKind): number {
  switch (failureKind) {
    case 'AUTHENTICATION':
      return HttpStatus.UNAUTHORIZED
    case 'INVALID_REQUEST':
      return HttpStatus.BAD_REQUEST
    case 'CONTRACT_CHANGED':
      return HttpStatus.BAD_GATEWAY
    case 'TIMEOUT':
      return HttpStatus.GATEWAY_TIMEOUT
    case 'RATE_LIMITED':
    case 'QUOTA_EXHAUSTED':
      return HttpStatus.TOO_MANY_REQUESTS
    case 'BLOCKED_NETWORK':
      return HttpStatus.FORBIDDEN
    case 'UPSTREAM_UNAVAILABLE':
    default:
      return HttpStatus.SERVICE_UNAVAILABLE
  }
}

/**
 * 외부 오류의 type 정보만 보존하고 credential이 포함될 수 있는 message와 stack을 제거한다.
 *
 * @param cause 외부 HTTP client 또는 runtime에서 전달된 원본 오류
 * @returns 민감정보가 제거된 안전한 오류 또는 원본이 Error가 아닐 때 undefined
 */
function sanitizeErrorCause(cause: unknown): Error | undefined {
  if (!(cause instanceof Error)) {
    return undefined
  }

  const sanitizedCause = new Error(redactSensitiveText(cause.message))
  sanitizedCause.name = redactSensitiveText(cause.name || 'Error')
  return sanitizedCause
}

/**
 * KECO API 연동 실패를 나타내는 표준 공급자 오류 클래스.
 * NestJS HttpException을 상속하여 getStatus() 및 getResponse() 계약과 마스킹/메타데이터를 보존한다.
 */
export class KecoProviderError extends HttpException {
  /**
   * 오류 분류 유형
   */
  public readonly failureKind: KecoFailureKind
  /**
   * 재시도 가능 여부
   */
  public readonly retryable: boolean
  /**
   * KECO 응답 결과 코드
   */
  public readonly resultCode?: KecoResultCode
  /**
   * HTTP 상태 코드
   */
  public readonly statusCode?: number
  /**
   * 원본 응답 메시지 (민감정보 마스킹 완료)
   */
  public readonly rawResultMsg?: string

  constructor(message: string, options: KecoProviderErrorOptions) {
    const sanitizedMessage = redactSensitiveText(message)
    const sanitizedRawResultMsg = options.rawResultMsg ? redactSensitiveText(options.rawResultMsg) : undefined
    const resolvedStatus = options.statusCode ?? mapFailureKindToHttpStatus(options.failureKind)
    const sanitizedCause = sanitizeErrorCause(options.cause)

    const responsePayload = {
      message: sanitizedMessage,
      failureKind: options.failureKind,
      retryable: options.retryable ?? false,
      resultCode: options.resultCode,
      statusCode: options.statusCode ?? resolvedStatus,
      rawResultMsg: sanitizedRawResultMsg,
    }

    super(
      responsePayload,
      resolvedStatus,
      sanitizedCause ? { cause: sanitizedCause } : undefined,
    )

    this.name = 'KecoProviderError'
    this.failureKind = options.failureKind
    this.retryable = options.retryable ?? false
    this.resultCode = options.resultCode
    this.statusCode = options.statusCode
    this.rawResultMsg = sanitizedRawResultMsg
    if (sanitizedCause) {
      this.cause = sanitizedCause
    }
  }
}

/**
 * KECO 응답 결과 코드로부터 표준화된 KecoProviderError 인스턴스를 생성한다.
 *
 * @param resultCode KECO 응답 헤더의 resultCode 문자열
 * @param resultMsg KECO 응답 헤더의 resultMsg 문자열 (선택 사항)
 * @returns KecoProviderError 인스턴스
 */
export function createKecoErrorFromResultCode(resultCode: string, resultMsg?: string): KecoProviderError {
  const classification = classifyKecoResultCode(resultCode)
  const description = resultMsg || classification.description
  return new KecoProviderError(`KECO API returned error code ${resultCode}: ${description}`, {
    failureKind: classification.failureKind ?? 'UPSTREAM_UNAVAILABLE',
    retryable: classification.retryable,
    resultCode,
    rawResultMsg: resultMsg,
  })
}

/**
 * HTTP 상태 코드를 적절한 KecoProviderError 인스턴스로 변환한다.
 *
 * @param status HTTP 응답 상태 코드 번호
 * @param statusText HTTP 응답 상태 텍스트 (로그/에러 유출 방지를 위해 사용되지 않음)
 * @returns KecoProviderError 인스턴스
 */
export function createKecoHttpError(status: number, statusText?: string): KecoProviderError {
  void statusText

  switch (status) {
    case 400:
    case 422:
      return new KecoProviderError(`KECO HTTP client error: ${status}`, {
        failureKind: 'INVALID_REQUEST',
        retryable: false,
        statusCode: status,
      })
    case 401:
    case 403:
      return new KecoProviderError(`KECO HTTP authentication error: ${status}`, {
        failureKind: 'AUTHENTICATION',
        retryable: false,
        statusCode: status,
      })
    case 404:
      return new KecoProviderError(`KECO HTTP endpoint not found: ${status}`, {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
        statusCode: status,
      })
    case 408:
    case 504:
      return new KecoProviderError(`KECO HTTP timeout error: ${status}`, {
        failureKind: 'TIMEOUT',
        retryable: true,
        statusCode: status,
      })
    case 429:
      return new KecoProviderError(`KECO HTTP rate limit exceeded: ${status}`, {
        failureKind: 'RATE_LIMITED',
        retryable: true,
        statusCode: status,
      })
    default:
      return new KecoProviderError(`KECO HTTP upstream error: ${status}`, {
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: status >= 500,
        statusCode: status,
      })
  }
}
