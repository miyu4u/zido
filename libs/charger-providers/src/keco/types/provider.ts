import type { ChargerInfoQuery, ChargerStatusQuery } from './request'
import type { KecoInfoItem, KecoStatusItem, ProviderPage } from './response'

/**
 * 충전기 실시간 상태 페이지 조회 함수 계약 인터페이스.
 */
export interface FetchStatusPage {
  /**
   * 충전기 실시간 상태 페이지를 비동기로 조회한다.
   *
   * @param query 상태 조회 조건 파라미터 (선택 사항)
   * @returns 충전기 상태 페이지 응답 프로미스
   */
  (query?: ChargerStatusQuery): Promise<ProviderPage<KecoStatusItem>>
}

/**
 * 충전소/충전기 기본 정보 페이지 조회 함수 계약 인터페이스.
 */
export interface FetchInfoPage {
  /**
   * 충전소/충전기 기본 정보 페이지를 비동기로 조회한다.
   *
   * @param query 정보 조회 조건 파라미터 (선택 사항)
   * @returns 충전소 기본 정보 페이지 응답 프로미스
   */
  (query?: ChargerInfoQuery): Promise<ProviderPage<KecoInfoItem>>
}

/**
 * KECO 전기차 충전기 공급자 인터페이스 계약.
 */
export interface IKecoProvider {
  /**
   * 충전기 실시간 상태 페이지를 조회한다.
   */
  fetchStatusPage: FetchStatusPage
  /**
   * 충전소/충전기 기본 정보 페이지를 조회한다.
   */
  fetchInfoPage: FetchInfoPage
}

/**
 * KECO 공급자 텔레메트리 이벤트 인터페이스.
 */
export interface KecoTelemetryEvent {
  /**
   * 공급자 식별자 (예: 'keco')
   */
  provider: string
  /**
   * 요청 엔드포인트 경로 (예: '/getChargerStatus')
   */
  endpoint: string
  /**
   * KECO 응답 헤더 결과 코드 또는 오류 코드
   */
  resultCode?: string
  /**
   * HTTP 응답 상태 코드
   */
  httpStatus?: number
  /**
   * 요청 처리 소요 시간 (밀리초)
   */
  latencyMs: number
  /**
   * 반환된 데이터 항목 건수
   */
  itemCount?: number
  /**
   * 데이터 신선도 상태
   */
  freshness?: 'FRESH' | 'STALE' | 'UNKNOWN'
  /**
   * 재시도 횟수
   */
  retryCount?: number
  /**
   * 쿼터 상태 ('OK' | 'RATE_LIMITED' | 'EXHAUSTED' | 'ERROR')
   */
  quotaState?: string
}

/**
 * KECO 공급자 텔레메트리 기록 인터페이스.
 */
export interface KecoTelemetryRecorder {
  /**
   * 텔레메트리 이벤트를 기록한다.
   *
   * @param event 텔레메트리 이벤트 객체
   */
  record(event: KecoTelemetryEvent): void
}

/**
 * KECO API Service 생성 옵션 인터페이스.
 */
export interface KecoAPIServiceOptions {
  /**
   * 공공데이터포털 발급 ServiceKey (필수)
   */
  serviceKey: string
  /**
   * KECO API 기본 엔드포인트 URL (필수)
   */
  endpoint: string
  /**
   * HTTP 요청 타임아웃 제한 시간(밀리초, 필수)
   */
  timeoutMs: number
  /**
   * 테스트용 주입 Fetch 함수
   */
  fetchFn?: typeof globalThis.fetch
  /**
   * 테스트용 주입 Fetch 함수 호환 alias
   */
  fetch?: typeof globalThis.fetch
  /**
   * 로컬 개발/테스트용 비보안 HTTP 엔드포인트 허용 플래그
   */
  allowInsecureHttp?: boolean
}

/**
 * KECO 비즈니스 Service 생성 옵션 인터페이스.
 */
export interface KecoServiceOptions {
  /**
   * 텔레메트리 기록기 인스턴스
   */
  telemetry?: KecoTelemetryRecorder
}
