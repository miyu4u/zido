import { z } from 'zod'

/**
 * 장소 검색에서 사용하는 중심 좌표의 구조를 검증한다.
 */
const CoordinateSchema = z.object({
    /** 위도 */
    lat: z.number(),
    /** 경도 */
    lng: z.number(),
})

/**
 * 지오코딩 입력 파라미터의 구조를 정의한다.
 */
export const GeoGeocodeInputSchema = z.object({
    /** 주소 문자열 */
    address: z.string(),
})

export type GeoGeocodeInput = z.infer<typeof GeoGeocodeInputSchema>

/**
 * 지오코딩 결과 payload의 구조를 정의한다.
 */
export const GeoGeocodeOutputSchema = z.object({
    /** 위도 */
    lat: z.number(),
    /** 경도 */
    lng: z.number(),
    /** 제공자 */
    provider: z.string(),
    /** 원본 응답 데이터 */
    raw: z.unknown(),
})

export type GeoGeocodeOutput = z.infer<typeof GeoGeocodeOutputSchema>

/**
 * 장소 검색 입력 파라미터의 구조를 정의한다.
 */
export const PlaceResolveInputSchema = z.object({
    /** 검색 쿼리 */
    query: z.string(),
})

export type PlaceResolveInput = z.infer<typeof PlaceResolveInputSchema>

/**
 * 장소 검색 결과 payload의 구조를 정의한다.
 */
export const PlaceResolveOutputSchema = z.object({
    /** 장소명 */
    name: z.string(),
    /** 주소 */
    address: z.string(),
    /** 위도 */
    lat: z.number(),
    /** 경도 */
    lng: z.number(),
    /** 제공자 */
    provider: z.string(),
    /** 원본 응답 데이터 */
    raw: z.unknown(),
})

export type PlaceResolveOutput = z.infer<typeof PlaceResolveOutputSchema>

/**
 * 주변 장소 검색 입력 파라미터의 구조를 정의한다.
 */
export const PlaceSearchNearbyInputSchema = z.object({
    /** 중심 좌표 */
    center: CoordinateSchema,
    /** 검색 키워드 */
    keyword: z.string(),
    /** 검색 반경 (미터) */
    radiusM: z.number(),
})

export type PlaceSearchNearbyInput = z.infer<typeof PlaceSearchNearbyInputSchema>

/**
 * 주변 장소 결과 item payload의 구조를 정의한다.
 */
export const PlaceSearchNearbyItemSchema = z.object({
    /** 장소명 */
    name: z.string(),
    /** 주소 */
    address: z.string(),
    /** 도로명 주소 */
    roadAddress: z.string().optional(),
    /** 위도 */
    lat: z.number(),
    /** 경도 */
    lng: z.number(),
    /** 제공자 */
    provider: z.string(),
    /** 원본 응답 데이터 */
    raw: z.unknown(),
    /** 중심 좌표에서의 거리 (미터) */
    distanceM: z.number(),
})

/**
 * 주변 장소 검색 결과 payload의 구조를 정의한다.
 */
export const PlaceSearchNearbyOutputSchema = z.object({
    /** 장소 목록 (거리 정보 포함) */
    items: z.array(PlaceSearchNearbyItemSchema),
})

export type PlaceSearchNearbyOutput = z.infer<typeof PlaceSearchNearbyOutputSchema>
