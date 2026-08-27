import { z } from 'zod'

/**
 * KECO 충전기 응답 기본 공통 항목 스키마.
 * status 및 info API에서 공통으로 반환되는 핵심 식별자 및 상태 필드를 정의한다.
 */
export const KecoBaseItemSchema = z.object({
  /**
   * 기관/사업자 코드 (예: ME)
   */
  busiId: z.string().nullable(),
  /**
   * 충전소 식별자 (예: 28260005)
   */
  statId: z.string().nullable(),
  /**
   * 충전기 식별자 (예: 01, 02)
   */
  chgerId: z.string().nullable(),
  /**
   * 충전기 상태 코드 원천값 (예: "2")
   */
  stat: z.string().nullable(),
  /**
   * 상태갱신일시 원천 문자열 (예: "20190829121020", yyyyMMddHHmmss)
   */
  statUpdDt: z.string().nullable(),
})

/**
 * KECO 충전기 응답 기본 공통 항목 타입.
 */
export type KecoBaseItem = z.infer<typeof KecoBaseItemSchema>

/**
 * KECO getChargerStatus 실시간 상태 응답 항목 스키마.
 */
export const KecoStatusItemSchema = KecoBaseItemSchema.pick({
  /**
   * 기관/사업자 코드
   */
  busiId: true,
  /**
   * 충전소 식별자
   */
  statId: true,
  /**
   * 충전기 식별자
   */
  chgerId: true,
  /**
   * 충전기 상태 코드 원천값
   */
  stat: true,
  /**
   * 상태갱신일시 원천 문자열
   */
  statUpdDt: true,
})

/**
 * KECO getChargerStatus 실시간 상태 응답 항목 타입.
 */
export type KecoStatusItem = z.infer<typeof KecoStatusItemSchema>

/**
 * KECO getChargerInfo 기본 정보 응답 항목 스키마.
 * 공통 항목 스키마를 확장하여 위치, 충전기 규격, 운영 기관 등 상세 정보를 포함한다.
 */
export const KecoInfoItemSchema = KecoBaseItemSchema.extend({
  /**
   * 충전소 명칭
   */
  statNm: z.string().nullable(),
  /**
   * 충전기 타입 코드 (예: 01, 02, 03, 04, 05, 06, 07, 08, 89)
   */
  chgerType: z.string().nullable(),
  /**
   * 소재지 도로명주소
   */
  addr: z.string().nullable(),
  /**
   * 소재지 주소 (도로명 또는 지번)
   */
  address: z.string().nullable(),
  /**
   * 상세 위치 안내
   */
  detail: z.string().nullable(),
  /**
   * 상세 위치 (호환성 필드)
   */
  location: z.string().nullable().optional(),
  /**
   * 상세 주소 (호환성 필드)
   */
  addrDetail: z.string().nullable().optional(),
  /**
   * 위도 좌표 (WGS84)
   */
  lat: z.union([z.string(), z.number()]).nullable(),
  /**
   * 경도 좌표 (WGS84)
   */
  lng: z.union([z.string(), z.number()]).nullable(),
  /**
   * 이용 가능 시간 안내 문자열
   */
  useTime: z.string().nullable(),
  /**
   * 기관/사업자 명칭
   */
  busiNm: z.string().nullable(),
  /**
   * 기관/사업자 명칭 (호환성 필드)
   */
  busnNm: z.string().nullable().optional(),
  /**
   * 기관/사업자 연락처
   */
  busiCall: z.string().nullable(),
  /**
   * 마지막 충전시작일시 문자열 (yyyyMMddHHmmss)
   */
  lastTsdt: z.string().nullable(),
  /**
   * 마지막 충전종료일시 문자열 (yyyyMMddHHmmss)
   */
  lastTedt: z.string().nullable(),
  /**
   * 충전중 시작일시 문자열 (yyyyMMddHHmmss)
   */
  nowTsdt: z.string().nullable(),
  /**
   * 충전용량 / 출력 (kW)
   */
  output: z.union([z.string(), z.number()]).nullable(),
  /**
   * 충전방식 (단독/동시 등)
   */
  method: z.string().nullable(),
  /**
   * 시·도 코드 (2자리)
   */
  zcode: z.string().nullable(),
  /**
   * 시·군·구 코드 (5자리)
   */
  zscode: z.string().nullable(),
  /**
   * 충전소 구분 대분류 코드
   */
  kind: z.string().nullable(),
  /**
   * 충전소 구분 소분류 코드
   */
  kindDetail: z.string().nullable(),
  /**
   * 주차료 무료 여부 (Y/N)
   */
  parkingFree: z.string().nullable(),
  /**
   * 충전소 안내 및 주의사항
   */
  note: z.string().nullable(),
  /**
   * 이용자 제한 여부 (Y/N)
   */
  limitYn: z.string().nullable(),
  /**
   * 이용 제한 사유 세부
   */
  limitDetail: z.string().nullable(),
  /**
   * 삭제 여부 (Y/N)
   */
  delYn: z.string().nullable(),
  /**
   * 삭제 사유 세부
   */
  delDetail: z.string().nullable(),
  /**
   * 교통 혼잡 여부 (Y/N)
   */
  trafficYn: z.string().nullable(),
  /**
   * 설치 연도 (yyyy)
   */
  year: z.string().nullable(),
  /**
   * 설치 층수
   */
  floorNum: z.string().nullable(),
  /**
   * 층 구분 (지상/지하 등)
   */
  floorType: z.string().nullable(),
})

/**
 * KECO getChargerInfo 기본 정보 응답 항목 타입.
 */
export type KecoInfoItem = z.infer<typeof KecoInfoItemSchema>

/**
 * 제네릭 페이징 응답 봉투 스키마를 생성하는 팩토리 함수.
 *
 * @param itemSchema 각 페이지 항목의 Zod 스키마
 * @returns 페이징 봉투 Zod 스키마
 */
export function createProviderPageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    /**
     * 정상 응답은 '00', 조회 결과 없음은 '03'으로 구분하는 공공데이터 응답 상태값
     */
    resultCode: z.string(),
    /**
     * upstream이 상태 코드의 의미를 설명하며 빈 문자열도 허용하는 진단 문구
     */
    resultMsg: z.string(),
    /**
     * 1부터 시작하며 요청한 pageNo와 대응하는 현재 응답 페이지 위치
     */
    pageNo: z.number(),
    /**
     * 요청에 적용된 페이지당 최대 항목 수이며 실제 items 길이보다 클 수 있는 건수
     */
    numOfRows: z.number(),
    /**
     * 현재 query 조건에 맞는 전체 항목 수로 후속 페이지 존재 여부를 판정하는 건수
     */
    totalCount: z.number(),
    /**
     * 현재 페이지에서 반환된 항목이며 조회 결과가 없을 때 빈 배열
     */
    items: z.array(itemSchema),
  })
}

/**
 * 제네릭 공급자 페이지 응답 인터페이스.
 */
export interface ProviderPage<T> {
  /**
   * 정상 응답과 조회 결과 없음 또는 upstream 실패를 구분하는 공공데이터 상태값
   */
  resultCode: string
  /**
   * 상태 코드의 의미를 보조하며 upstream이 비워 반환할 수 있는 진단 문구
   */
  resultMsg: string
  /**
   * 1부터 시작하며 요청 pageNo에 대응하는 현재 응답 페이지 위치
   */
  pageNo: number
  /**
   * 요청에 적용된 페이지당 최대 항목 수이며 실제 items 길이와 다를 수 있는 건수
   */
  numOfRows: number
  /**
   * query 전체 결과의 항목 수로 후속 페이지 수집 여부를 결정하는 건수
   */
  totalCount: number
  /**
   * 현재 페이지에 포함된 payload이며 조회 결과가 없을 때 빈 배열
   */
  items: T[]
}

/**
 * KECO 상태 페이지 응답 스키마.
 */
export const KecoStatusPageSchema = createProviderPageSchema(KecoStatusItemSchema)

/**
 * KECO 상태 페이지 응답 타입.
 */
export type KecoStatusPage = z.infer<typeof KecoStatusPageSchema>

/**
 * KECO 정보 페이지 응답 스키마.
 */
export const KecoInfoPageSchema = createProviderPageSchema(KecoInfoItemSchema)

/**
 * KECO 정보 페이지 응답 타입.
 */
export type KecoInfoPage = z.infer<typeof KecoInfoPageSchema>
