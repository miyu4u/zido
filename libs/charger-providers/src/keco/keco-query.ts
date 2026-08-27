import { ValidatedInfoQuerySchema, ValidatedStatusQuerySchema } from './types'
import type { ChargerInfoQuery, ChargerStatusQuery, ValidatedInfoQuery, ValidatedStatusQuery } from './types'
import { KecoProviderError } from './keco.exception'

export type { ValidatedStatusQuery, ValidatedInfoQuery }

/**
 * KECO 충전기 상태 조회 쿼리 파라미터를 Zod 스키마로 검증 및 정규화한다.
 *
 * @param query 사용자가 전달한 상태 조회 쿼리 파라미터 객체
 * @returns 검증 및 기본값이 채워진 정규화된 쿼리 객체
 * @throws {KecoProviderError} 유효하지 않은 쿼리 파라미터인 경우 INVALID_REQUEST 에러
 */
export function validateChargerStatusQuery(query?: ChargerStatusQuery): ValidatedStatusQuery {
  const sanitizedInput = query
    ? {
        ...query,
        zcode: query.zcode !== undefined && query.zcode !== null && String(query.zcode).trim() !== ''
          ? String(query.zcode).trim()
          : undefined,
      }
    : {}

  const parseResult = ValidatedStatusQuerySchema.safeParse(sanitizedInput)
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]
    throw new KecoProviderError(
      `Invalid query parameter: ${issue.path.join('.') || 'root'} - ${issue.message}`,
      { failureKind: 'INVALID_REQUEST', retryable: false },
    )
  }

  return parseResult.data
}

/**
 * KECO 충전소/충전기 기본 정보 조회 쿼리 파라미터를 Zod 스키마로 검증 및 정규화한다.
 *
 * @param query 사용자가 전달한 정보 조회 쿼리 파라미터 객체
 * @returns 검증 및 기본값이 채워진 정규화된 쿼리 객체
 * @throws {KecoProviderError} 유효하지 않은 쿼리 파라미터인 경우 INVALID_REQUEST 에러
 */
export function validateChargerInfoQuery(query?: ChargerInfoQuery): ValidatedInfoQuery {
  const sanitizedInput = query
    ? {
        ...query,
        zcode: query.zcode !== undefined && query.zcode !== null && String(query.zcode).trim() !== ''
          ? String(query.zcode).trim()
          : undefined,
      }
    : {}

  const parseResult = ValidatedInfoQuerySchema.safeParse(sanitizedInput)
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]
    throw new KecoProviderError(
      `Invalid query parameter: ${issue.path.join('.') || 'root'} - ${issue.message}`,
      { failureKind: 'INVALID_REQUEST', retryable: false },
    )
  }

  return parseResult.data
}

/**
 * KECO getChargerStatus 요청을 위한 전체 URL을 생성한다.
 *
 * @param endpoint KECO API 기본 엔드포인트 URL
 * @param serviceKey 공공데이터포털 발급 서비스키
 * @param query 검증된 상태 조회 파라미터
 * @returns 쿼리 파라미터가 포함된 전체 요청 URL 문자열
 */
export function buildStatusUrl(
  endpoint: string,
  serviceKey: string,
  query: ValidatedStatusQuery,
): string {
  const base = endpoint.replace(/\/+$/, '')
  const url = new URL(`${base}/getChargerStatus`)
  url.searchParams.set('serviceKey', serviceKey)
  url.searchParams.set('pageNo', String(query.pageNo))
  url.searchParams.set('numOfRows', String(query.numOfRows))
  url.searchParams.set('period', String(query.period))
  if (query.zcode) {
    url.searchParams.set('zcode', query.zcode)
  }
  return url.toString()
}

/**
 * KECO getChargerInfo 요청을 위한 전체 URL을 생성한다.
 *
 * @param endpoint KECO API 기본 엔드포인트 URL
 * @param serviceKey 공공데이터포털 발급 서비스키
 * @param query 검증된 정보 조회 파라미터
 * @returns 쿼리 파라미터가 포함된 전체 요청 URL 문자열
 */
export function buildInfoUrl(
  endpoint: string,
  serviceKey: string,
  query: ValidatedInfoQuery,
): string {
  const base = endpoint.replace(/\/+$/, '')
  const url = new URL(`${base}/getChargerInfo`)
  url.searchParams.set('serviceKey', serviceKey)
  url.searchParams.set('pageNo', String(query.pageNo))
  url.searchParams.set('numOfRows', String(query.numOfRows))
  if (query.zcode) {
    url.searchParams.set('zcode', query.zcode)
  }
  return url.toString()
}
