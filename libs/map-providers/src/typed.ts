/**
 * 지도 API 프로바이더 공통 타입 정의
 */

import { AxiosInstance } from 'axios'

/**
 * 통합 장소 데이터 타입
 */
export type Place = {
    name: string
    address: string
    roadAddress?: string
    lat: number
    lng: number
    provider: string
    raw: unknown
    distanceM?: number // searchNearby에서 계산된 거리 (미터)
}

/**
 * 좌표 결과 타입
 */
export type GeoResult = {
    lat: number
    lng: number
    provider: string
    raw: unknown
}

/**
 * 모든 프로바이더가 구현해야 할 인터페이스
 */
export interface Provider {
    /**
     * 키워드로 장소 검색 (단일 결과)
     * @param query 검색 키워드
     * @returns 장소 정보 또는 null
     */
    resolve(query: string): Promise<Place | null>

    /**
     * 중심 좌표 기준 주변 장소 검색
     * @param center 중심 좌표
     * @param keyword 검색 키워드
     * @param radiusM 반경 (미터)
     * @returns 장소 목록
     */
    searchNearby(center: { lat: number; lng: number }, keyword: string, radiusM: number): Promise<Place[]>

    /**
     * 주소를 좌표로 변환 (지오코딩)
     * @param address 주소 문자열
     * @returns 좌표 정보 또는 null
     */
    geocode(address: string): Promise<GeoResult | null>
}

export interface IHttpService {
    http: AxiosInstance
}
