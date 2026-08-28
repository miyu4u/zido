import { z } from 'zod'
import type { KecoResultCode } from './result-codes'
import type { ChargerInfoQuery, ChargerStatusQuery } from './request'
import type { KecoInfoItem, KecoStatusItem } from './response'

/**
 * KECO 운영기관 식별자를 다른 문자열 ID와 구분
 */
export const KecoBusinessIdSchema = z.string().min(1).brand<'KecoBusinessId'>()

export type KecoBusinessId = z.infer<typeof KecoBusinessIdSchema>

/**
 * KECO 충전소 식별자를 다른 문자열 ID와 구분
 */
export const KecoStationIdSchema = z.string().min(1).brand<'KecoStationId'>()

export type KecoStationId = z.infer<typeof KecoStationIdSchema>

/**
 * KECO 충전기 식별자를 다른 문자열 ID와 구분
 */
export const KecoChargerIdSchema = z.string().min(1).brand<'KecoChargerId'>()

export type KecoChargerId = z.infer<typeof KecoChargerIdSchema>

/**
 * KECO 원천 호출 실패를 domain 경계에서 분류하는 값
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

export type KecoFailureKind = z.infer<typeof KecoFailureKindSchema>

/**
 * Provider가 pagination을 보존해 반환하는 공통 페이지 계약
 */
export interface ProviderPage<T> {
  resultCode: KecoResultCode
  resultMsg: string
  pageNo: number
  numOfRows: number
  totalCount: number
  items: T[]
}

/**
 * KECO 정보·상태 페이지를 조회하는 read-only provider 계약
 */
export interface IKecoProvider {
  fetchStatusPage(query: ChargerStatusQuery): Promise<ProviderPage<KecoStatusItem>>
  fetchInfoPage(query: ChargerInfoQuery): Promise<ProviderPage<KecoInfoItem>>
}
