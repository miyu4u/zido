import { z } from 'zod'

/**
 * KECO 전기차 충전기 API 요청 파라미터 제약 조건 및 경계값 상수.
 */
export const KECO_REQUEST_BOUNDS = {
  /** 페이지 번호 최소값 */
  PAGE_NO_MIN: 1,
  /** 한 페이지 결과 수 최소값 */
  NUM_OF_ROWS_MIN: 10,
  /** 한 페이지 결과 수 최대값 */
  NUM_OF_ROWS_MAX: 9999,
  /** 한 페이지 결과 수 기본값 */
  DEFAULT_NUM_OF_ROWS: 9999,
  /** 상태갱신 조회 범위(분) 최소값 */
  PERIOD_MIN: 1,
  /** 상태갱신 조회 범위(분) 최대값 */
  PERIOD_MAX: 10,
  /** 상태갱신 조회 범위(분) 기본값 */
  DEFAULT_PERIOD: 5,
} as const

/**
 * zcode와 nationwide 중 정확히 하나만 지정되었는지 검증하는 refine helper.
 */
function refineScopeConstraint<T extends { zcode?: string; nationwide?: true }>(
  schema: z.ZodType<T>,
) {
  return schema.refine(
    (data) => (data.zcode !== undefined) !== (data.nationwide === true),
    {
      message: 'Exactly one of zcode or nationwide must be provided',
      path: ['zcode'],
    },
  )
}

/**
 * KECO 기본 요청 쿼리 스키마.
 */
export const KecoBaseQuerySchema = refineScopeConstraint(
  z.object({
    /**
     * 페이지 번호 (1 이상의 정수)
     */
    pageNo: z
      .number()
      .int('pageNo must be an integer')
      .min(KECO_REQUEST_BOUNDS.PAGE_NO_MIN, `pageNo must be >= ${KECO_REQUEST_BOUNDS.PAGE_NO_MIN}`),
    /**
     * 한 페이지 결과 수 (10 ~ 9999 범위의 정수)
     */
    numOfRows: z
      .number()
      .int('numOfRows must be an integer')
      .min(KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN, `numOfRows must be >= ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN}`)
      .max(KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX, `numOfRows must be <= ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX}`),
    /**
     * 시·도 코드 (2자리 숫자 문자열, 예: "11", "28")
     */
    zcode: z
      .string()
      .trim()
      .regex(/^\d{2}$/, 'zcode must be a 2-digit numeric string (e.g. "11", "28")')
      .optional(),
    /**
     * 전국 단위 조회 여부 (명시적 true 지정 시 zcode 없이 전체 조회)
     */
    nationwide: z.literal(true).optional(),
  }),
)

const BaseChargerInfoQuerySchema = z.object({
  /**
   * 페이지 번호 (1 이상의 정수, 생략 시 기본값 1)
   */
  pageNo: z
    .number()
    .int('pageNo must be an integer')
    .min(KECO_REQUEST_BOUNDS.PAGE_NO_MIN, `pageNo must be >= ${KECO_REQUEST_BOUNDS.PAGE_NO_MIN}`)
    .optional(),
  /**
   * 한 페이지 결과 수 (10 ~ 9999 범위의 정수, 생략 시 기본값 9999)
   */
  numOfRows: z
    .number()
    .int('numOfRows must be an integer')
    .min(KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN, `numOfRows must be >= ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN}`)
    .max(KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX, `numOfRows must be <= ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX}`)
    .optional(),
  /**
   * 시·도 코드 (2자리 숫자 문자열, 예: "11", "28")
   */
  zcode: z
    .string()
    .trim()
    .regex(/^\d{2}$/, 'zcode must be a 2-digit numeric string (e.g. "11", "28")')
    .optional(),
  /**
   * 전국 단위 조회 여부 (명시적 true 지정 시 zcode 없이 전체 조회)
   */
  nationwide: z.literal(true).optional(),
})

/**
 * 충전소/충전기 기본 정보 조회 쿼리 파라미터 스키마.
 */
export const ChargerInfoQuerySchema = refineScopeConstraint(BaseChargerInfoQuerySchema)

/**
 * 충전소/충전기 기본 정보 조회 쿼리 파라미터 타입.
 */
export type ChargerInfoQuery = z.infer<typeof ChargerInfoQuerySchema>

const BaseChargerStatusQuerySchema = BaseChargerInfoQuerySchema.extend({
  /**
   * 상태갱신 조회 범위(분) (1 ~ 10 범위의 정수, 생략 시 기본값 5)
   */
  period: z
    .number()
    .int('period must be an integer')
    .min(KECO_REQUEST_BOUNDS.PERIOD_MIN, `period must be >= ${KECO_REQUEST_BOUNDS.PERIOD_MIN}`)
    .max(KECO_REQUEST_BOUNDS.PERIOD_MAX, `period must be <= ${KECO_REQUEST_BOUNDS.PERIOD_MAX}`)
    .optional(),
})

/**
 * 충전기 실시간 상태 조회 쿼리 파라미터 스키마.
 */
export const ChargerStatusQuerySchema = refineScopeConstraint(BaseChargerStatusQuerySchema)

/**
 * 충전기 실시간 상태 조회 쿼리 파라미터 타입.
 */
export type ChargerStatusQuery = z.infer<typeof ChargerStatusQuerySchema>

const BaseValidatedInfoQuerySchema = z.object({
  /**
   * 페이지 번호 (1 이상의 정수, 기본값 1)
   */
  pageNo: z
    .number()
    .int('pageNo must be an integer')
    .min(KECO_REQUEST_BOUNDS.PAGE_NO_MIN, `pageNo must be >= ${KECO_REQUEST_BOUNDS.PAGE_NO_MIN}`)
    .default(KECO_REQUEST_BOUNDS.PAGE_NO_MIN),
  /**
   * 한 페이지 결과 수 (10 ~ 9999 범위의 정수, 기본값 9999)
   */
  numOfRows: z
    .number()
    .int('numOfRows must be an integer')
    .min(KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN, `numOfRows must be >= ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN}`)
    .max(KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX, `numOfRows must be <= ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX}`)
    .default(KECO_REQUEST_BOUNDS.DEFAULT_NUM_OF_ROWS),
  /**
   * 시·도 코드 (2자리 숫자 문자열, 선택 사항)
   */
  zcode: z
    .string()
    .trim()
    .regex(/^\d{2}$/, 'zcode must be a 2-digit numeric string (e.g. "11", "28")')
    .optional(),
  /**
   * 전국 단위 조회 여부 (명시적 true 지정 시 zcode 없이 전체 조회)
   */
  nationwide: z.literal(true).optional(),
})

/**
 * 검증 및 기본값이 적용된 충전소 정보 조회 쿼리 스키마.
 */
export const ValidatedInfoQuerySchema = refineScopeConstraint(BaseValidatedInfoQuerySchema)

/**
 * 검증 및 기본값이 적용된 충전소 정보 조회 쿼리 타입.
 */
export type ValidatedInfoQuery = z.infer<typeof ValidatedInfoQuerySchema>

const BaseValidatedStatusQuerySchema = BaseValidatedInfoQuerySchema.extend({
  /**
   * 상태갱신 조회 범위(분) (1 ~ 10 범위의 정수, 기본값 5)
   */
  period: z
    .number()
    .int('period must be an integer')
    .min(KECO_REQUEST_BOUNDS.PERIOD_MIN, `period must be >= ${KECO_REQUEST_BOUNDS.PERIOD_MIN}`)
    .max(KECO_REQUEST_BOUNDS.PERIOD_MAX, `period must be <= ${KECO_REQUEST_BOUNDS.PERIOD_MAX}`)
    .default(KECO_REQUEST_BOUNDS.DEFAULT_PERIOD),
})

/**
 * 검증 및 기본값이 적용된 충전기 상태 조회 쿼리 스키마.
 */
export const ValidatedStatusQuerySchema = refineScopeConstraint(BaseValidatedStatusQuerySchema)

/**
 * 검증 및 기본값이 적용된 충전기 상태 조회 쿼리 타입.
 */
export type ValidatedStatusQuery = z.infer<typeof ValidatedStatusQuerySchema>

const BaseKecoStatusRequestSchema = BaseValidatedStatusQuerySchema.extend({
  /**
   * 공공데이터포털 발급 ServiceKey (로그/트레이스 마스킹 필수)
   */
  serviceKey: z.string(),
})

/**
 * KECO getChargerStatus API 직접 요청 파라미터 스키마.
 */
export const KecoStatusRequestSchema = refineScopeConstraint(BaseKecoStatusRequestSchema)

/**
 * KECO getChargerStatus API 직접 요청 파라미터 타입.
 */
export type KecoStatusRequest = z.infer<typeof KecoStatusRequestSchema>

const BaseKecoInfoRequestSchema = BaseValidatedInfoQuerySchema.extend({
  /**
   * 공공데이터포털 발급 ServiceKey (로그/트레이스 마스킹 필수)
   */
  serviceKey: z.string(),
})

/**
 * KECO getChargerInfo API 직접 요청 파라미터 스키마.
 */
export const KecoInfoRequestSchema = refineScopeConstraint(BaseKecoInfoRequestSchema)

/**
 * KECO getChargerInfo API 직접 요청 파라미터 타입.
 */
export type KecoInfoRequest = z.infer<typeof KecoInfoRequestSchema>
