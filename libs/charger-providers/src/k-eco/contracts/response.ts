import { z } from 'zod'
import { KecoResultCodeSchema } from './result-codes'
import { KecoBusinessIdSchema, KecoChargerIdSchema, KecoStationIdSchema } from './typed'

const NullableTextSchema = z.string().nullable().optional()
const NullableNumericTextSchema = z.union([z.string(), z.number()]).nullable().optional()

const KecoItemFieldsSchema = z.object({
  /**
   * 충전기 운영기관 식별자
   */
  busiId: KecoBusinessIdSchema.nullable(),
  /**
   * 충전소 식별자
   */
  statId: KecoStationIdSchema.nullable(),
  /**
   * 충전기 식별자
   */
  chgerId: KecoChargerIdSchema.nullable(),
  /**
   * 충전소 이름
   */
  statNm: NullableTextSchema,
  /**
   * 충전기 유형 코드
   */
  chgerType: NullableTextSchema,
  /**
   * 충전소 도로명 또는 지번 주소
   */
  addr: NullableTextSchema,
  /**
   * 주소 호환 필드
   */
  address: NullableTextSchema,
  /**
   * 충전소 상세 주소
   */
  addrDetail: NullableTextSchema,
  /**
   * 충전소 위치 상세 설명
   */
  detail: NullableTextSchema,
  /**
   * 충전기 설치 위치 설명
   */
  location: NullableTextSchema,
  /**
   * 충전소 위도
   */
  lat: NullableNumericTextSchema,
  /**
   * 충전소 경도
   */
  lng: NullableNumericTextSchema,
  /**
   * 충전소 이용 가능 시간
   */
  useTime: NullableTextSchema,
  /**
   * 충전기 운영기관 이름
   */
  busiNm: NullableTextSchema,
  /**
   * 기관 이름 원문 필드
   */
  bnm: NullableTextSchema,
  /**
   * 충전기 운영기관 연락처
   */
  busiCall: NullableTextSchema,
  /**
   * 충전기 원문 상태 코드
   */
  stat: NullableTextSchema,
  /**
   * 충전기 상태가 갱신된 원천 시각
   */
  statUpdDt: NullableTextSchema,
  /**
   * 마지막 충전 시작 시각
   */
  lastTsdt: NullableTextSchema,
  /**
   * 마지막 충전 종료 시각
   */
  lastTedt: NullableTextSchema,
  /**
   * 현재 충전 시작 시각
   */
  nowTsdt: NullableTextSchema,
  /**
   * 충전기 출력 용량
   */
  output: NullableNumericTextSchema,
  /**
   * 단독 또는 동시 충전 방식
   */
  method: NullableTextSchema,
  /**
   * 충전소의 2자리 시·도 코드
   */
  zcode: NullableTextSchema,
  /**
   * 충전소의 5자리 상세 지역 코드
   */
  zscode: NullableTextSchema,
  /**
   * 충전소 시설 구분 코드
   */
  kind: NullableTextSchema,
  /**
   * 충전소 시설 상세 구분 코드
   */
  kindDetail: NullableTextSchema,
  /**
   * 주차 요금 무료 여부
   */
  parkingFree: NullableTextSchema,
  /**
   * 충전소 이용 안내 또는 비고
   */
  note: NullableTextSchema,
  /**
   * 충전소 이용 제한 여부
   */
  limitYn: NullableTextSchema,
  /**
   * 충전소 이용 제한 상세 내용
   */
  limitDetail: NullableTextSchema,
  /**
   * 충전기 정보 삭제 여부
   */
  delYn: NullableTextSchema,
  /**
   * 충전기 정보 삭제 사유
   */
  delDetail: NullableTextSchema,
  /**
   * 교통약자 편의 제공 여부
   */
  trafficYn: NullableTextSchema,
  /**
   * 충전기 설치 연도
   */
  year: NullableTextSchema,
  /**
   * 충전기 설치 층수
   */
  floorNum: NullableTextSchema,
  /**
   * 충전기 설치 층 유형
   */
  floorType: NullableTextSchema,
})

/**
 * KECO 충전기 원천 식별자 계약
 */
export const KecoBaseItemSchema = KecoItemFieldsSchema.pick({
  busiId: true,
  statId: true,
  chgerId: true,
})

export type KecoBaseItem = z.infer<typeof KecoBaseItemSchema>

/**
 * getChargerStatus가 반환하는 충전기 상태 항목
 */
export const KecoStatusItemSchema = KecoItemFieldsSchema.pick({
  busiId: true,
  statId: true,
  chgerId: true,
  lastTsdt: true,
  lastTedt: true,
  nowTsdt: true,
}).extend({
  /**
   * 상태 응답에 반드시 포함되는 원문 상태 코드
   */
  stat: z.string().nullable(),
  /**
   * 상태 응답에 반드시 포함되는 원천 갱신 시각
   */
  statUpdDt: z.string().nullable(),
})

export type KecoStatusItem = z.infer<typeof KecoStatusItemSchema>

/**
 * getChargerInfo가 반환하는 v1.25 충전소·충전기 정보 항목
 */
export const KecoInfoItemSchema = KecoBaseItemSchema.extend(
  KecoItemFieldsSchema.omit({
    busiId: true,
    statId: true,
    chgerId: true,
  }).shape,
)

export type KecoInfoItem = z.infer<typeof KecoInfoItemSchema>

/**
 * KECO 페이지 응답의 공통 pagination 및 결과 metadata
 */
export const KecoPageMetadataSchema = z.object({
  /**
   * 공공데이터포털 결과 코드
   */
  resultCode: KecoResultCodeSchema,
  /**
   * 공공데이터포털 결과 메시지
   */
  resultMsg: z.string(),
  /**
   * 응답에 해당하는 페이지 번호
   */
  pageNo: z.number().int().min(1),
  /**
   * 응답 페이지의 요청 항목 수
   */
  numOfRows: z.number().int().min(0),
  /**
   * 조회 조건에 일치하는 전체 항목 수
   */
  totalCount: z.number().int().min(0),
})

/**
 * getChargerStatus 페이지 응답 계약
 */
export const KecoStatusPageSchema = KecoPageMetadataSchema.extend({
  /**
   * 상태 페이지에 포함된 충전기 상태 목록
   */
  items: z.array(KecoStatusItemSchema),
})

export type KecoStatusPage = z.infer<typeof KecoStatusPageSchema>

/**
 * getChargerInfo 페이지 응답 계약
 */
export const KecoInfoPageSchema = KecoPageMetadataSchema.extend({
  /**
   * 정보 페이지에 포함된 충전소·충전기 정보 목록
   */
  items: z.array(KecoInfoItemSchema),
})

export type KecoInfoPage = z.infer<typeof KecoInfoPageSchema>
