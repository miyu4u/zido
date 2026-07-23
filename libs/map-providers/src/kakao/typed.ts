/**
 * Kakao Provider 설정
 */
export type KakaoProviderConfig = {
    restKey: string
}

/**
 * Kakao 검색 결과 메타데이터
 */
type KakaoSearchMeta = {
    total_count: number
    pageable_count: number
    is_end: boolean
}

/**
 * Kakao 검색 응답 기본 타입
 */
type KakaoSearchResponse<TDocument> = {
    documents: TDocument[]
    meta: KakaoSearchMeta
}

/**
 * Kakao 장소 문서 기본 타입
 */
export type KakaoPlaceDocument = {
    place_name: string
    address_name: string
    road_address_name?: string
    x: string // 경도
    y: string // 위도
    [key: string]: unknown
}

/**
 * Kakao 키워드 검색 문서
 */
type KakaoKeywordDocument = KakaoPlaceDocument

/**
 * Kakao 카테고리 검색 문서
 */
type KakaoCategoryDocument = KakaoPlaceDocument & {
    distance?: string
}

/**
 * Kakao 주소 문서
 */
type KakaoAddressDocument = {
    address_name: string
    y: string // 위도
    x: string // 경도
    address_type: string
    [key: string]: unknown
}

export type KakaoKeywordSearchResponse = KakaoSearchResponse<KakaoKeywordDocument>
export type KakaoCategorySearchResponse = KakaoSearchResponse<KakaoCategoryDocument>
export type KakaoAddressSearchResponse = KakaoSearchResponse<KakaoAddressDocument>
