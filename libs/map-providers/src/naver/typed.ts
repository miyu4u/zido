/**
 * 네이버 API 제공자 설정
 */
export interface NaverProviderConfig {
    /** 클라이언트 ID */
    clientId: string
    /** 클라이언트 시크릿 */
    clientSecret: string
}

/**
 * 좌표 정보
 */
export interface NaverCoordinates {
    /** X 좌표 */
    x: string
    /** Y 좌표 */
    y: string
}

/**
 * 주소 정보
 */
export interface NaverAddressInfo {
    /** 도로명 주소 */
    roadAddress?: string
    /** 지번 주소 */
    jibunAddress?: string
}

/**
 * 네이버 로컬 검색 결과 아이템
 */
export interface NaverLocalSearchItem {
    /** 장소 제목 */
    title: string
    /** 장소 링크 */
    link: string
    /** 장소 카테고리 */
    category: string
    /** 장소 설명 */
    description: string
    /** 전화번호 */
    telephone: string
    /** 지번 주소 */
    address: string
    /** 도로명 주소 */
    roadAddress: string
    /** X 좌표 */
    mapx: string
    /** Y 좌표 */
    mapy: string
}

/**
 * 네이버 로컬 검색 응답
 */
export interface NaverLocalSearchResponse {
    /** 최종 빌드 날짜 */
    lastBuildDate: string
    /** 전체 검색 결과 수 */
    total: number
    /** 시작 위치 */
    start: number
    /** 표시된 결과 수 */
    display: number
    /** 검색 결과 아이템 배열 */
    items: NaverLocalSearchItem[]
}

/**
 * 네이버 지오코딩 주소 정보
 */
export interface NaverGeocodeAddress extends NaverAddressInfo, NaverCoordinates {
    /** 영문 주소 */
    englishAddress?: string
}

/**
 * 네이버 지오코딩 응답
 */
export interface NaverGeocodeResponse {
    /** 응답 상태 */
    status?: string
    /** 메타데이터 */
    meta?: {
        /** 전체 개수 */
        totalCount: number
        /** 페이지 번호 */
        page: number
        /** 현재 페이지 개수 */
        count: number
    }
    /** 주소 정보 배열 */
    addresses?: NaverGeocodeAddress[]
    /** 에러 메시지 */
    errorMessage?: string
    /** 에러 코드 */
    errorCode?: string
}
