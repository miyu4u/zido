/**
 * KECO (한국환경공단) 전기차 충전소/충전기 API 계약 정의
 *
 * @see docs/research/ev-charging-api-integration-design-v1.md
 * @see docs/research/ev-charging-api-research-v1.md
 */

/**
 * KECO Open API Known Result Codes
 *
 * 공공데이터포털 / KECO OpenAPI 표준 헤더 결과 코드
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

export type KecoResultCode = (typeof KECO_RESULT_CODES)[keyof typeof KECO_RESULT_CODES] | string

/**
 * Provider failure classification kind
 */
export type KecoFailureKind =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'AUTHENTICATION'
  | 'INVALID_REQUEST'
  | 'CONTRACT_CHANGED'
  | 'BLOCKED_NETWORK'
  | 'UPSTREAM_UNAVAILABLE'

/**
 * Failure category & retry policy classification result
 */
export type KecoResultClassification = {
  isSuccess: boolean
  failureKind: KecoFailureKind | null
  retryable: boolean
  description: string
}

/**
 * Classifies a KECO resultCode into standardized failure category and retryability.
 *
 * @param resultCode The header.resultCode from KECO XML/JSON response
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
 * Checks if a result code represents a successful response
 */
export function isKecoSuccessResult(resultCode: string): boolean {
  return resultCode === KECO_RESULT_CODES.OK || resultCode === KECO_RESULT_CODES.NO_DATA
}

/**
 * Request parameter bounds and constraints for KECO EvCharger API
 */
export const KECO_REQUEST_BOUNDS = {
  PAGE_NO_MIN: 1,
  NUM_OF_ROWS_MIN: 10,
  NUM_OF_ROWS_MAX: 9999,
  DEFAULT_NUM_OF_ROWS: 9999,
  PERIOD_MIN: 1,
  PERIOD_MAX: 10,
  DEFAULT_PERIOD: 5,
} as const

/**
 * KECO getChargerStatus request parameters
 */
export type KecoStatusRequest = {
  /** 공공데이터포털 발급 ServiceKey (로그/트레이스 마스킹 필수) */
  serviceKey: string
  /** 페이지 번호 (1 이상) */
  pageNo: number
  /** 한 페이지 결과 수 (10 ~ 9999) */
  numOfRows: number
  /** 상태갱신 조회 범위(분) (1 ~ 10, 기본값 5) */
  period?: number
  /** 시·도 코드 (운영 설정으로 관리, 하드코딩 금지) */
  zcode?: string
}

/**
 * KECO getChargerStatus raw XML item shape (confirmed contract)
 */
export type KecoStatusItem = {
  /** 기관/사업자 코드 (예: ME) */
  busiId: string | null
  /** 충전소 ID (예: 28260005) */
  statId: string | null
  /** 충전기 ID (예: 02) */
  chgerId: string | null
  /** 충전기 상태 코드 원천값 (예: "2") */
  stat: string | null
  /** 상태갱신일시 원천 문자열 (예: "20190829121020", yyyyMMddHHmmss) */
  statUpdDt: string | null
}

/**
 * KECO getChargerInfo request parameters
 */
export type KecoInfoRequest = {
  /** 공공데이터포털 발급 ServiceKey (로그/트레이스 마스킹 필수) */
  serviceKey: string
  /** 페이지 번호 (1 이상) */
  pageNo: number
  /** 한 페이지 결과 수 (10 ~ 9999) */
  numOfRows: number
  /** 시·도 코드 (선택 사항) */
  zcode?: string
}

/**
 * KECO getChargerInfo raw item shape
 *
 * Documented fields from official v1.25 guide.
 */
export type KecoInfoItem = {
  /** 기관/사업자 코드 */
  busiId: string | null
  /** 충전소 ID (status API와의 join key) */
  statId: string | null
  /** 충전기 ID */
  chgerId: string | null
  /** 충전소 명칭 */
  statNm: string | null
  /** 충전기 타입 (예: 01, 02, 03, 04, 05, 06, 07, 08, 89) */
  chgerType: string | null
  /** 소재지 도로명주소 */
  addr: string | null
  /** 주소 */
  address: string | null
  /** 상세 주소 / 위치 */
  detail: string | null
  /** 상세 위치 (legacy alias) */
  location?: string | null
  /** 상세 주소 (legacy alias) */
  addrDetail?: string | null
  /** 위도 (Latitude, WGS84) */
  lat: string | number | null
  /** 경도 (Longitude, WGS84) */
  lng: string | number | null
  /** 이용 가능 시간 */
  useTime: string | null
  /** 기관/사업자 명칭 */
  busiNm: string | null
  /** 기관/사업자 명칭 alias */
  busnNm?: string | null
  /** 기관/사업자 연락처 */
  busiCall: string | null
  /** 충전기 상태 코드 원천값 */
  stat: string | null
  /** 상태갱신일시 원천 문자열 */
  statUpdDt: string | null
  /** 마지막 충전시작일시 */
  lastTsdt: string | null
  /** 마지막 충전종료일시 */
  lastTedt: string | null
  /** 충전중 시작일시 */
  nowTsdt: string | null
  /** 충전용량 / 출력 (kW) */
  output: string | number | null
  /** 충전방식 */
  method: string | null
  /** 시·도 코드 */
  zcode: string | null
  /** 시·군·구 코드 */
  zscode: string | null
  /** 충전소 구분 대분류 */
  kind: string | null
  /** 충전소 구분 소분류 */
  kindDetail: string | null
  /** 주차료 무료 여부 (Y/N) */
  parkingFree: string | null
  /** 충전소 안내/주의사항 */
  note: string | null
  /** 이용자 제한 여부 (Y/N) */
  limitYn: string | null
  /** 이용 제한 사유 세부 */
  limitDetail: string | null
  /** 삭제 여부 (Y/N) */
  delYn: string | null
  /** 삭제 사유 세부 */
  delDetail: string | null
  /** 교통 혼잡 여부 (Y/N) */
  trafficYn: string | null
  /** 설치 연도 */
  year: string | null
  /** 층수 */
  floorNum: string | null
  /** 층 구분 */
  floorType: string | null
}

/**
 * Generic provider pagination envelope
 */
export interface ProviderPage<T> {
  resultCode: string
  resultMsg: string
  pageNo: number
  numOfRows: number
  totalCount: number
  items: T[]
}

/**
 * KECO getChargerStatus response page
 */
export type KecoStatusPage = ProviderPage<KecoStatusItem>

/**
 * KECO getChargerInfo response page
 */
export type KecoInfoPage = ProviderPage<KecoInfoItem>

/**
 * Query parameters for fetching charger status page
 */
export interface ChargerStatusQuery {
  /** 페이지 번호 (1 이상, 기본값 1) */
  pageNo?: number
  /** 한 페이지 결과 수 (10 ~ 9999, 기본값 9999) */
  numOfRows?: number
  /** 상태갱신 조회 범위(분) (1 ~ 10, 기본값 5) */
  period?: number
  /** 시·도 코드 (2자리 숫자 문자열, 예: "11", "28") */
  zcode?: string
}

/**
 * Query parameters for fetching charger info page
 */
export interface ChargerInfoQuery {
  /** 페이지 번호 (1 이상, 기본값 1) */
  pageNo?: number
  /** 한 페이지 결과 수 (10 ~ 9999, 기본값 9999) */
  numOfRows?: number
  /** 시·도 코드 (2자리 숫자 문자열, 예: "11", "28") */
  zcode?: string
}

/**
 * Function contract for fetching status page
 */
export type FetchStatusPage = (query?: ChargerStatusQuery) => Promise<ProviderPage<KecoStatusItem>>

/**
 * Function contract for fetching info page
 */
export type FetchInfoPage = (query?: ChargerInfoQuery) => Promise<ProviderPage<KecoInfoItem>>

/**
 * KECO Provider configuration options
 */
export interface KecoProviderOptions {
  /** 공공데이터포털 발급 ServiceKey (필수) */
  serviceKey: string
  /** API Base Endpoint URL (기본값: 'https://apis.data.go.kr/B552584/EvCharger') */
  endpoint?: string
  /** HTTP 요청 제한 시간(ms) (기본값: 8000) */
  timeoutMs?: number
  /** Injected fetch function for testability (기본값: globalThis.fetch) */
  fetch?: typeof globalThis.fetch
  /** Explicitly enables an injected HTTP adapter for localhost-only tests. */
  allowInsecureHttp?: boolean
  telemetry?: {
    record(event: {
      provider: string
      endpoint: string
      resultCode?: string
      httpStatus?: number
      latencyMs: number
      itemCount?: number
      freshness?: 'FRESH' | 'STALE' | 'UNKNOWN'
      retryCount?: number
      quotaState?: string
    }): void
  }
}

/**
 * KECO Provider interface contract
 */
export interface IKecoProvider {
  fetchStatusPage: FetchStatusPage
  fetchInfoPage: FetchInfoPage
}

/**
 * Metadata recording the boundary status of KECO API contracts
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
