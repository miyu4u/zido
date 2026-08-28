import { z } from 'zod'
import { KecoFailureKindSchema } from './typed'

/**
 * 공공데이터포털과 KECO OpenAPI 표준 header 결과 코드
 */
export const KECO_RESULT_CODES = {
  OK: '00',
  APPLICATION_ERROR: '01',
  DB_ERROR: '02',
  NO_DATA: '03',
  HTTP_ERROR: '04',
  SERVICETIMEOUT_ERROR: '05',
  INVALID_REQUEST_PARAMETER_ERROR: '10',
  NO_MANDATORY_REQUEST_PARAMETERS_ERROR: '11',
  NO_OPENAPI_SERVICE_ERROR: '12',
  SERVICE_ACCESS_DENIED_ERROR: '20',
  TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR: '21',
  LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: '22',
  SERVICE_KEY_IS_NOT_REGISTERED_ERROR: '23',
  DEADLINE_HAS_EXPIRED_ERROR: '29',
  UNREGISTERED_SUB_SERVICE_KEY_ERROR: '30',
  EXPIRED_SUB_SERVICE_KEY_ERROR: '31',
  UNKNOWN_ERROR: '99',
} as const

/**
 * KECO header가 반환하는 결과 코드
 */
export const KecoResultCodeSchema = z.string().min(1)

export type KecoResultCode = z.infer<typeof KecoResultCodeSchema>

/**
 * 결과 코드에 대응하는 성공 여부와 재시도 정책
 */
export const KecoResultClassificationSchema = z.object({
  isSuccess: z.boolean(),
  failureKind: KecoFailureKindSchema.nullable(),
  retryable: z.boolean(),
  description: z.string(),
})

export type KecoResultClassification = z.infer<typeof KecoResultClassificationSchema>

/**
 * KECO 결과 코드를 domain failure와 재시도 정책으로 분류
 */
export function classifyKecoResultCode(resultCode: string): KecoResultClassification {
  switch (resultCode) {
    case KECO_RESULT_CODES.OK:
      return {
        isSuccess: true,
        failureKind: null,
        retryable: false,
        description: '정상 처리',
      }
    case KECO_RESULT_CODES.NO_DATA:
      return {
        isSuccess: true,
        failureKind: null,
        retryable: false,
        description: '데이터 없음 (정상 빈 결과)',
      }
    case KECO_RESULT_CODES.APPLICATION_ERROR:
    case KECO_RESULT_CODES.DB_ERROR:
    case KECO_RESULT_CODES.HTTP_ERROR:
      return {
        isSuccess: false,
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        description: '상위 서비스 일시적 오류 (재시도 가능)',
      }
    case KECO_RESULT_CODES.SERVICETIMEOUT_ERROR:
      return {
        isSuccess: false,
        failureKind: 'TIMEOUT',
        retryable: true,
        description: '서비스 연결 시간 초과 (재시도 가능)',
      }
    case KECO_RESULT_CODES.INVALID_REQUEST_PARAMETER_ERROR:
    case KECO_RESULT_CODES.NO_MANDATORY_REQUEST_PARAMETERS_ERROR:
      return {
        isSuccess: false,
        failureKind: 'INVALID_REQUEST',
        retryable: false,
        description: '요청 파라미터 오류 (재시도 금지, adapter 파라미터 검증 수정 필요)',
      }
    case KECO_RESULT_CODES.NO_OPENAPI_SERVICE_ERROR:
      return {
        isSuccess: false,
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
        description: 'OpenAPI 서비스 미존재 또는 폐기 (버전과 endpoint 확인 필요)',
      }
    case KECO_RESULT_CODES.SERVICE_ACCESS_DENIED_ERROR:
    case KECO_RESULT_CODES.TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR:
    case KECO_RESULT_CODES.UNREGISTERED_SUB_SERVICE_KEY_ERROR:
    case KECO_RESULT_CODES.EXPIRED_SUB_SERVICE_KEY_ERROR:
      return {
        isSuccess: false,
        failureKind: 'AUTHENTICATION',
        retryable: false,
        description: '인증키 권한 누락, 미등록 또는 만료 (secret과 운영 설정 확인 필요)',
      }
    case KECO_RESULT_CODES.LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR:
      return {
        isSuccess: false,
        failureKind: 'QUOTA_EXHAUSTED',
        retryable: false,
        description: '일일 요청 한도 초과 (provider 수집 중지 후 quota reset 대기)',
      }
    case KECO_RESULT_CODES.SERVICE_KEY_IS_NOT_REGISTERED_ERROR:
      return {
        isSuccess: false,
        failureKind: 'RATE_LIMITED',
        retryable: true,
        description: '초당 요청 한도 초과 (Retry-After 또는 지수 backoff 필요)',
      }
    case KECO_RESULT_CODES.DEADLINE_HAS_EXPIRED_ERROR:
      return {
        isSuccess: false,
        failureKind: 'BLOCKED_NETWORK',
        retryable: false,
        description: '미등록 또는 차단 IP (egress IP와 신청 정보 확인 필요)',
      }
    default:
      return {
        isSuccess: false,
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: false,
        description: `미확인 결과 코드 (${resultCode})`,
      }
  }
}

/**
 * 정상 처리 또는 데이터 없음 결과인지 확인
 */
export function isKecoSuccessResult(resultCode: string): boolean {
  return classifyKecoResultCode(resultCode).isSuccess
}

/**
 * 공식 문서와 fixture로 확인한 KECO API 계약 상태
 */
export const KECO_CONTRACT_METADATA = {
  statusApiStatus: 'CONFIRMED',
  infoApiStatus: 'CONFIRMED_OFFICIAL_V1_25_GUIDE',
  notes: [
    'getChargerStatus contract (busiId, statId, chgerId, stat, statUpdDt) is confirmed by official API docs.',
    'getChargerInfo fields and statId + chgerId join are confirmed by the official v1.25 guide and the sanitized fixture.',
    'stat numeric status codes are interpreted only through the versioned v1.25 mapping.',
  ],
} as const
