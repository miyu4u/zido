import { HttpStatus } from '@nestjs/common'
import { createKecoErrorFromResultCode, KecoUpstreamProviderException } from '../k-eco.exception'
import {
  classifyKecoResultCode,
  isKecoSuccessResult,
  KECO_CONTRACT_METADATA,
  KECO_RESULT_CODES,
  KecoResultClassificationSchema,
} from './result-codes'

describe('KECO result code policy', () => {
  it.each([KECO_RESULT_CODES.OK, KECO_RESULT_CODES.NO_DATA])('%s를 성공 결과로 분류한다', (resultCode) => {
    expect(classifyKecoResultCode(resultCode)).toMatchObject({
      isSuccess: true,
      failureKind: null,
      retryable: false,
    })
    expect(isKecoSuccessResult(resultCode)).toBe(true)
  })

  it.each([
    [KECO_RESULT_CODES.APPLICATION_ERROR, 'UPSTREAM_UNAVAILABLE', true],
    [KECO_RESULT_CODES.DB_ERROR, 'UPSTREAM_UNAVAILABLE', true],
    [KECO_RESULT_CODES.HTTP_ERROR, 'UPSTREAM_UNAVAILABLE', true],
    [KECO_RESULT_CODES.SERVICETIMEOUT_ERROR, 'TIMEOUT', true],
    [KECO_RESULT_CODES.INVALID_REQUEST_PARAMETER_ERROR, 'INVALID_REQUEST', false],
    [KECO_RESULT_CODES.NO_MANDATORY_REQUEST_PARAMETERS_ERROR, 'INVALID_REQUEST', false],
    [KECO_RESULT_CODES.NO_OPENAPI_SERVICE_ERROR, 'CONTRACT_CHANGED', false],
    [KECO_RESULT_CODES.SERVICE_ACCESS_DENIED_ERROR, 'AUTHENTICATION', false],
    [KECO_RESULT_CODES.TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR, 'AUTHENTICATION', false],
    [KECO_RESULT_CODES.UNREGISTERED_SUB_SERVICE_KEY_ERROR, 'AUTHENTICATION', false],
    [KECO_RESULT_CODES.EXPIRED_SUB_SERVICE_KEY_ERROR, 'AUTHENTICATION', false],
    [KECO_RESULT_CODES.LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR, 'QUOTA_EXHAUSTED', false],
    [KECO_RESULT_CODES.SERVICE_KEY_IS_NOT_REGISTERED_ERROR, 'RATE_LIMITED', true],
    [KECO_RESULT_CODES.DEADLINE_HAS_EXPIRED_ERROR, 'BLOCKED_NETWORK', false],
  ] as const)('%s를 %s 오류로 분류한다', (resultCode, failureKind, retryable) => {
    const classification = classifyKecoResultCode(resultCode)

    expect(classification).toMatchObject({
      isSuccess: false,
      failureKind,
      retryable,
    })
    expect(KecoResultClassificationSchema.safeParse(classification).success).toBe(true)
    expect(isKecoSuccessResult(resultCode)).toBe(false)
  })

  it.each([KECO_RESULT_CODES.UNKNOWN_ERROR, 'UNDOCUMENTED'])('알 수 없는 %s를 재시도하지 않는다', (resultCode) => {
    expect(classifyKecoResultCode(resultCode)).toMatchObject({
      isSuccess: false,
      failureKind: 'UPSTREAM_UNAVAILABLE',
      retryable: false,
    })
  })

  it('공식 문서로 확인한 API 계약 metadata를 보존한다', () => {
    expect(KECO_CONTRACT_METADATA).toMatchObject({
      statusApiStatus: 'CONFIRMED',
      infoApiStatus: 'CONFIRMED_OFFICIAL_V1_25_GUIDE',
    })
    expect(KECO_CONTRACT_METADATA.notes).toHaveLength(3)
  })
})

describe('createKecoErrorFromResultCode', () => {
  it('quota 결과를 metadata가 포함된 업스트림 exception으로 변환한다', () => {
    const error = createKecoErrorFromResultCode(
      KECO_RESULT_CODES.LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR,
      'quota exceeded',
    )

    expect(error).toBeInstanceOf(KecoUpstreamProviderException)
    expect(error).toMatchObject({
      origin: 'UPSTREAM_PROVIDER',
      failureKind: 'QUOTA_EXHAUSTED',
      retryable: false,
      resultCode: KECO_RESULT_CODES.LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR,
      rawResultMsg: 'quota exceeded',
    })
    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
    expect(error.getResponse()).toMatchObject({
      resultCode: KECO_RESULT_CODES.LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR,
      rawResultMsg: 'quota exceeded',
    })
  })

  it('result message의 credential을 exception과 public response에서 제거한다', () => {
    const secret = 'SECRET_VALUE'
    const error = createKecoErrorFromResultCode(
      KECO_RESULT_CODES.SERVICE_ACCESS_DENIED_ERROR,
      `access denied serviceKey=${secret}`,
    )

    expect(error.failureKind).toBe('AUTHENTICATION')
    expect(error.rawResultMsg).not.toContain(secret)
    expect(error.message).not.toContain(secret)
    expect(JSON.stringify(error.getResponse())).not.toContain(secret)
  })
})
