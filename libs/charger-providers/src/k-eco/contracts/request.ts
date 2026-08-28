import { z } from 'zod'
import { KecoChargerIdSchema, KecoStationIdSchema } from './typed'

/**
 * KECO OpenAPI 요청에 적용되는 공식 페이지 및 상태 조회 범위
 */
export const KECO_REQUEST_BOUNDS = {
  /**
   * 허용하는 최소 페이지 번호
   */
  MIN_PAGE_NO: 1,
  /**
   * 페이지 번호를 생략했을 때 사용하는 기본값
   */
  DEFAULT_PAGE_NO: 1,
  /**
   * 한 페이지에 요청할 수 있는 최소 항목 수
   */
  MIN_NUM_OF_ROWS: 10,
  /**
   * 한 페이지에 요청할 수 있는 최대 항목 수
   */
  MAX_NUM_OF_ROWS: 9_999,
  /**
   * 페이지 크기를 생략했을 때 사용하는 기본값
   */
  DEFAULT_NUM_OF_ROWS: 9_999,
  /**
   * 상태 변경 조회에 허용하는 최소 기간
   */
  MIN_PERIOD: 1,
  /**
   * 상태 변경 조회에 허용하는 최대 기간
   */
  MAX_PERIOD: 10,
  /**
   * 상태 변경 조회 기간을 생략했을 때 사용하는 기본값
   */
  DEFAULT_PERIOD: 5,
} as const

/**
 * KECO 시·도 코드 형식
 */
export const KecoRegionCodeSchema = z.string().regex(/^\d{2}$/, 'zcode must be a 2-digit region code')

/**
 * KECO 상세 지역 코드 형식
 */
export const KecoSubregionCodeSchema = z.string().regex(/^\d{5}$/, 'zscode must be a 5-digit region code')

const KecoQueryFieldsSchema = z.object({
  /**
   * 조회할 페이지 번호
   */
  pageNo: z.number().int().min(KECO_REQUEST_BOUNDS.MIN_PAGE_NO).optional(),
  /**
   * 한 페이지에 요청할 항목 수
   */
  numOfRows: z
    .number()
    .int()
    .min(KECO_REQUEST_BOUNDS.MIN_NUM_OF_ROWS)
    .max(KECO_REQUEST_BOUNDS.MAX_NUM_OF_ROWS)
    .optional(),
  /**
   * 최근 상태 변경을 조회할 기간이며 단위는 분
   */
  period: z.number().int().min(KECO_REQUEST_BOUNDS.MIN_PERIOD).max(KECO_REQUEST_BOUNDS.MAX_PERIOD).optional(),
  /**
   * 조회 범위를 제한하는 2자리 시·도 코드
   */
  zcode: KecoRegionCodeSchema.optional(),
  /**
   * 조회 범위를 제한하는 5자리 상세 지역 코드
   */
  zscode: KecoSubregionCodeSchema.optional(),
  /**
   * 충전소 시설 구분 코드
   */
  kind: z.string().min(1).optional(),
  /**
   * 충전소 시설 상세 구분 코드
   */
  kindDetail: z.string().min(1).optional(),
  /**
   * 특정 충전소만 조회할 때 사용하는 식별자
   */
  statId: KecoStationIdSchema.optional(),
  /**
   * 특정 충전기만 조회할 때 사용하는 식별자
   */
  chgerId: KecoChargerIdSchema.optional(),
  /**
   * 전국 범위 조회를 명시적으로 승인하는 값
   */
  nationwide: z.literal(true).optional(),
})

/**
 * 충전소 기본 정보 페이지를 조회할 때 provider가 받는 입력
 */
export const ChargerInfoQuerySchema = KecoQueryFieldsSchema.pick({
  pageNo: true,
  numOfRows: true,
  zcode: true,
  zscode: true,
  kind: true,
  kindDetail: true,
  statId: true,
  chgerId: true,
  nationwide: true,
})

export type ChargerInfoQuery = z.infer<typeof ChargerInfoQuerySchema>

/**
 * 충전기 상태 페이지 입력은 기본 정보 조회 조건에 조회 기간을 추가
 */
export const ChargerStatusQuerySchema = ChargerInfoQuerySchema.extend({
  period: KecoQueryFieldsSchema.shape.period,
})

export type ChargerStatusQuery = z.infer<typeof ChargerStatusQuerySchema>

/**
 * 기본값이 적용된 충전기 상태 조회 입력
 */
export const ValidatedStatusQuerySchema = ChargerStatusQuerySchema.transform((query) => ({
  ...query,
  pageNo: query.pageNo ?? KECO_REQUEST_BOUNDS.DEFAULT_PAGE_NO,
  numOfRows: query.numOfRows ?? KECO_REQUEST_BOUNDS.DEFAULT_NUM_OF_ROWS,
  period: query.period ?? KECO_REQUEST_BOUNDS.DEFAULT_PERIOD,
}))

export type ValidatedStatusQuery = z.output<typeof ValidatedStatusQuerySchema>

/**
 * 기본값이 적용된 충전소 정보 조회 입력
 */
export const ValidatedInfoQuerySchema = ChargerInfoQuerySchema.transform((query) => ({
  ...query,
  pageNo: query.pageNo ?? KECO_REQUEST_BOUNDS.DEFAULT_PAGE_NO,
  numOfRows: query.numOfRows ?? KECO_REQUEST_BOUNDS.DEFAULT_NUM_OF_ROWS,
}))

export type ValidatedInfoQuery = z.output<typeof ValidatedInfoQuerySchema>

const KecoTransportFieldsSchema = z.object({
  serviceKey: z.string().trim().min(1),
  dataType: z.enum(['XML', 'JSON']).default('XML'),
})

/**
 * 외부 getChargerStatus 요청에 필요한 인증 및 전송 형식 계약
 */
export const KecoStatusRequestSchema = ChargerStatusQuerySchema.extend(KecoTransportFieldsSchema.shape)

export type KecoStatusRequest = z.infer<typeof KecoStatusRequestSchema>

/**
 * 외부 getChargerInfo 요청에 필요한 인증 및 전송 형식 계약
 */
export const KecoInfoRequestSchema = ChargerInfoQuerySchema.extend(KecoTransportFieldsSchema.shape)

export type KecoInfoRequest = z.infer<typeof KecoInfoRequestSchema>
