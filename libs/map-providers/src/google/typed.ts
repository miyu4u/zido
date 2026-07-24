/**
 * Google Provider 설정
 */
export type GoogleProviderConfig = {
  apiKey: string
}

/**
 * Google Places API (New) 응답 타입
 */

/**
 * Google Place 위치 정보
 */
export type GoogleLocation = {
  latitude: number
  longitude: number
}

/**
 * Google Place 표시 이름
 */
export type GoogleDisplayName = {
  text: string
  languageCode: string
}

/**
 * Google Place 객체
 */
export type GooglePlace = {
  id: string
  displayName: GoogleDisplayName
  formattedAddress?: string
  location?: GoogleLocation
  types?: string[]
  [key: string]: unknown
}

/**
 * Google Places Text Search 응답
 */
export type GoogleTextSearchResponse = {
  places: GooglePlace[]
}

/**
 * Google Places Nearby Search 요청 본문
 */
export type GoogleNearbySearchRequest = {
  includedTypes?: string[]
  maxResultCount?: number
  locationRestriction?: {
    circle: {
      center: GoogleLocation
      radius: number
    }
  }
  languageCode?: string
  rankPreference?: 'POPULARITY' | 'DISTANCE'
}

/**
 * Google Places Nearby Search 응답
 */
export type GoogleNearbySearchResponse = {
  places: GooglePlace[]
}

/**
 * Google Geocoding API 응답 타입
 */

/**
 * Google Geocoding 주소 컴포넌트
 */
export type GoogleAddressComponent = {
  long_name: string
  short_name: string
  types: string[]
}

/**
 * Google Geocoding 위치
 */
export type GoogleGeocodeLocation = {
  lat: number
  lng: number
}

/**
 * Google Geocoding 지오메트리
 */
export type GoogleGeocodeGeometry = {
  location: GoogleGeocodeLocation
  location_type: string
  viewport?: {
    northeast: GoogleGeocodeLocation
    southwest: GoogleGeocodeLocation
  }
  bounds?: {
    northeast: GoogleGeocodeLocation
    southwest: GoogleGeocodeLocation
  }
}

/**
 * Google Geocoding 결과
 */
export type GoogleGeocodeResult = {
  address_components: GoogleAddressComponent[]
  formatted_address: string
  geometry: GoogleGeocodeGeometry
  place_id: string
  types: string[]
}

/**
 * Google Geocoding 응답
 */
export type GoogleGeocodeResponse = {
  results: GoogleGeocodeResult[]
  status: 'OK' | 'ZERO_RESULTS' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'INVALID_REQUEST'
  error_message?: string
}
