import type { Place } from 'zido/map-providers'

/**
 * 지오코딩 입력 파라미터
 */
export interface GeoGeocodeInput {
    /** 주소 문자열 */
    address: string;
}

/**
 * 지오코딩 응답 결과
 */
export interface GeoGeocodeOutput {
    /** 위도 */
    lat: number;
    /** 경도 */
    lng: number;
    /** 제공자 */
    provider: string;
    /** 원본 응답 데이터 */
    raw: unknown;
}

/**
 * 장소 검색 입력 파라미터
 */
export interface PlaceResolveInput {
    /** 검색 쿼리 */
    query: string;
}

/**
 * 장소 검색 응답 결과
 */
export interface PlaceResolveOutput {
    /** 장소명 */
    name: string;
    /** 주소 */
    address: string;
    /** 위도 */
    lat: number;
    /** 경도 */
    lng: number;
    /** 제공자 */
    provider: string;
    /** 원본 응답 데이터 */
    raw: unknown;
}

/**
 * 주변 장소 검색 입력 파라미터
 */
export interface PlaceSearchNearbyInput {
    /** 중심 좌표 */
    center: { lat: number; lng: number; };
    /** 검색 키워드 */
    keyword: string;
    /** 검색 반경 (미터) */
    radiusM: number;
}

/**
 * 주변 장소 검색 응답 결과
 */
export interface PlaceSearchNearbyOutput {
    /** 장소 목록 (거리 정보 포함) */
    items: Array<Place & { distanceM: number; }>;
}
