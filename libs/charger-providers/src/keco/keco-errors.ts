import { KecoFailureKind, KecoResultCode, classifyKecoResultCode } from './keco-contracts'
import { redactSensitiveText } from './keco-redact'

export interface KecoProviderErrorOptions {
  failureKind: KecoFailureKind
  retryable?: boolean
  resultCode?: KecoResultCode
  statusCode?: number
  rawResultMsg?: string
  cause?: unknown
}

/**
 * Standardized provider error for KECO API failures.
 * Explicitly required by provider contract.
 */
export class KecoProviderError extends Error {
  public readonly failureKind: KecoFailureKind
  public readonly retryable: boolean
  public readonly resultCode?: KecoResultCode
  public readonly statusCode?: number
  public readonly rawResultMsg?: string

  constructor(message: string, options: KecoProviderErrorOptions) {
    super(redactSensitiveText(message))
    this.name = 'KecoProviderError'
    this.failureKind = options.failureKind
    this.retryable = options.retryable ?? false
    this.resultCode = options.resultCode
    this.statusCode = options.statusCode
    this.rawResultMsg = options.rawResultMsg ? redactSensitiveText(options.rawResultMsg) : undefined
    if (options.cause instanceof Error) {
      this.cause = options.cause
    }
  }
}

/**
 * Creates a KecoProviderError from an upstream resultCode.
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
 * Maps an HTTP status code to appropriate KecoProviderError using switch.
 */
export function createKecoHttpError(status: number, statusText?: string): KecoProviderError {
  // Status text is upstream-controlled; do not copy arbitrary response data
  // into a diagnostic that can cross the provider boundary.
  void statusText
  const suffix = ''

  switch (status) {
    case 400:
    case 422:
      return new KecoProviderError(`KECO HTTP client error: ${status}${suffix}`, {
        failureKind: 'INVALID_REQUEST',
        retryable: false,
        statusCode: status,
      })
    case 401:
    case 403:
      return new KecoProviderError(`KECO HTTP authentication error: ${status}${suffix}`, {
        failureKind: 'AUTHENTICATION',
        retryable: false,
        statusCode: status,
      })
    case 404:
      return new KecoProviderError(`KECO HTTP endpoint not found: ${status}${suffix}`, {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
        statusCode: status,
      })
    case 408:
    case 504:
      return new KecoProviderError(`KECO HTTP timeout error: ${status}${suffix}`, {
        failureKind: 'TIMEOUT',
        retryable: true,
        statusCode: status,
      })
    case 429:
      return new KecoProviderError(`KECO HTTP rate limit exceeded: ${status}${suffix}`, {
        failureKind: 'RATE_LIMITED',
        retryable: true,
        statusCode: status,
      })
    default:
      return new KecoProviderError(`KECO HTTP upstream error: ${status}${suffix}`, {
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: status >= 500,
        statusCode: status,
      })
  }
}
