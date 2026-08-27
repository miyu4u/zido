import { z } from 'zod'

/**
 * 공공데이터포털 / KECO OpenAPI 표준 헤더 결과 코드 상수 목록.
 */
export const KECO_RESULT_CODES = {
  /** 정상 처리 */
  OK: '00',
  /** 어플리케이션 에러 (일시적/원인 미상) */
  APPLICATION_ERROR: '01',
  /** DB 에러 (일시적 DB 장애) */
  DB_ERROR: '02',
  /** 데이터 없음 */
  NO_DATA: '03',
  /** HTTP 에러 */
  HTTP_ERROR: '04',
  /** 서비스 연결 실패 / 타임아웃 */
  SERVICETIMEOUT_ERROR: '05',
  /** 잘못된 요청 파라미터 에러 */
  INVALID_REQUEST_PARAMETER_ERROR: '10',
  /** 필수 파라미터 누락 */
  NO_MANDATORY_REQUEST_PARAMETERS_ERROR: '11',
  /** 해당 오픈API 서비스가 없거나 폐기됨 */
  NO_OPENAPI_SERVICE_ERROR: '12',
  /** 서비스 접근 거부 (인증키 누락 또는 권한 오류) */
  SERVICE_ACCESS_DENIED_ERROR: '20',
  /** 일시적 서비스 사용 불가 */
  TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR: '21',
  /** 서비스 요청 제한 횟수 초과 (일일 Quota 초과) */
  LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: '22',
  /** 서비스 요청 초당 제한 횟수 초과 (Rate limit 초과) */
  SERVICE_KEY_IS_NOT_REGISTERED_ERROR: '23',
  /** 등록되지 않은 IP (호출 IP 제한 / 차단 IP) */
  DEADLINE_HAS_EXPIRED_ERROR: '29',
  /** 등록되지 않은 서비스키 */
  UNREGISTERED_SUB_SERVICE_KEY_ERROR: '30',
  /** 만료된 서비스키 */
  EXPIRED_SUB_SERVICE_KEY_ERROR: '31',
  /** 기타 미등록/알 수 없는 에러 */
  UNKNOWN_ERROR: '99',
} as const

/**
 * KECO 응답 결과 코드 스키마.
 */
export const KecoResultCodeSchema = z.string()

/**
 * KECO 결과 코드 타입.
 */
export type KecoResultCode = (typeof KECO_RESULT_CODES)[keyof typeof KECO_RESULT_CODES] | string

/**
 * 공급자 장애 분류 유형 스키마.
 */
export const KecoFailureKindSchema = z.enum([
  'TIMEOUT',
  'RATE_LIMITED',
  'QUOTA_EXHAUSTED',
  'AUTHENTICATION',
  'INVALID_REQUEST',
  'CONTRACT_CHANGED',
  'BLOCKED_NETWORK',
  'UPSTREAM_UNAVAILABLE',
])

/**
 * 공급자 장애 분류 유형 타입.
 */
export type KecoFailureKind = z.infer<typeof KecoFailureKindSchema>

/**
 * 결과 코드 분류 및 재시도 정책 결과 스키마.
 */
export const KecoResultClassificationSchema = z.object({
  /**
   * 성공 응답 여부 (정상 00 또는 데이터 없음 03)
   */
  isSuccess: z.boolean(),
  /**
   * 장애 분류 유형 (성공인 경우 null)
   */
  failureKind: KecoFailureKindSchema.nullable(),
  /**
   * 일시적 오류로서 재시도 가능 여부
   */
  retryable: z.boolean(),
  /**
   * 결과 코드에 대한 상세 설명 문구
   */
  description: z.string(),
})

/**
 * 결과 코드 분류 및 재시도 정책 결과 타입.
 */
export type KecoResultClassification = z.infer<typeof KecoResultClassificationSchema>

/**
 * KECO 헤더 결과 코드를 표준화된 실패 범주 및 재시도 가능 여부로 분류한다.
 *
 * @param resultCode KECO 응답 헤더의 resultCode 문자열
 * @returns 분류 결과 및 재시도 정책 정보
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
        description: '요청 파라미터 오류 (재시도 금지, 어댑터 파라미터 검증 수정 필요)',
      }

    case KECO_RESULT_CODES.NO_OPENAPI_SERVICE_ERROR:
      return {
        isSuccess: false,
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
        description: '오픈API 서비스 미존재 또는 폐기됨 (즉시 중단 및 버전/엔드포인트 확인)',
      }

    case KECO_RESULT_CODES.SERVICE_ACCESS_DENIED_ERROR:
    case KECO_RESULT_CODES.TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR:
    case KECO_RESULT_CODES.UNREGISTERED_SUB_SERVICE_KEY_ERROR:
    case KECO_RESULT_CODES.EXPIRED_SUB_SERVICE_KEY_ERROR:
      return {
        isSuccess: false,
        failureKind: 'AUTHENTICATION',
        retryable: false,
        description: '인증키 권한 누락/미등록/만료 (재시도 금지, secret/운영 알림 필요)',
      }

    case KECO_RESULT_CODES.LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR:
      return {
        isSuccess: false,
        failureKind: 'QUOTA_EXHAUSTED',
        retryable: false,
        description: '일일 요청 한도 초과 (해당 provider 수집 중지, 리셋 대기)',
      }

    case KECO_RESULT_CODES.SERVICE_KEY_IS_NOT_REGISTERED_ERROR:
      return {
        isSuccess: false,
        failureKind: 'RATE_LIMITED',
        retryable: true,
        description: '초당 요청 한도 초과 (Retry-After 준수 또는 지수 백오프)',
      }

    case KECO_RESULT_CODES.DEADLINE_HAS_EXPIRED_ERROR:
      return {
        isSuccess: false,
        failureKind: 'BLOCKED_NETWORK',
        retryable: false,
        description: '미등록 IP 또는 차단 IP (재시도 금지, egress IP 및 신청 정보 확인)',
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
 * 결과 코드가 성공(정상 또는 데이터 없음)을 나타내는지 확인한다.
 *
 * @param resultCode KECO 응답 결과 코드
 * @returns 성공 여부 불리언
 */
export function isKecoSuccessResult(resultCode: string): boolean {
  return resultCode === KECO_RESULT_CODES.OK || resultCode === KECO_RESULT_CODES.NO_DATA
}

/**
 * KECO API 계약 경계 상태를 기록하는 메타데이터 상수.
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
