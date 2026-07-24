import { Injectable } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { ProviderException } from 'zido/common'
import type { GeoResult, IHttpService, Place, Provider } from '../typed'
import type {
    GoogleGeocodeResponse,
    GoogleNearbySearchRequest,
    GoogleNearbySearchResponse,
    GooglePlace,
    GoogleProviderConfig,
    GoogleTextSearchResponse,
} from './typed'

/**
 * Google Places API Provider
 * Google Places API (New)와 Geocoding API를 사용하여 장소 검색 및 지오코딩
 */
@Injectable()
export class GoogleVendor implements Provider, IHttpService {
    private readonly providerName = 'google'
    private readonly apiKey: string
    private readonly baseUrl = 'https://places.googleapis.com/v1'
    private readonly geocodeUrl = 'https://maps.googleapis.com/maps/api/geocode/json'
    public http: AxiosInstance

    constructor(config: GoogleProviderConfig) {
        if (!config.apiKey) {
            throw new ProviderException('Google API key is required', 'google', 'MISSING_API_KEY')
        }
        this.apiKey = config.apiKey
        this.http = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': this.apiKey,
            },
        })
    }

    /**
     * 키워드로 장소 검색 (단일 결과)
     * @param query 검색 키워드
     * @returns Place 객체 또는 null
     */
    async resolve(query: string): Promise<Place | null> {
        try {
            const response = await this.http.post<GoogleTextSearchResponse>(
                '/places:searchText',
                {
                    textQuery: query,
                    maxResultCount: 1,
                },
                {
                    headers: {
                        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
                    },
                },
            )

            const place = response.data.places[0]
            if (!place) {
                return null
            }

            return this.toPlace(place)
        } catch (error) {
            throw this.toProviderException('Failed to resolve place', error)
        }
    }

    /**
     * 중심 좌표 기준 주변 장소 검색
     * @param center 중심 좌표
     * @param keyword 검색 키워드
     * @param radiusM 반경 (미터)
     * @returns Place 객체 배열
     */
    async searchNearby(
        center: { lat: number; lng: number },
        keyword: string,
        radiusM: number,
    ): Promise<Place[]> {
        try {
            const radius = this.clampRadius(radiusM)
            const requestBody: GoogleNearbySearchRequest = {
                maxResultCount: 15,
                locationRestriction: {
                    circle: {
                        center: {
                            latitude: center.lat,
                            longitude: center.lng,
                        },
                        radius,
                    },
                },
                rankPreference: 'DISTANCE',
            }

            // 키워드가 있으면 Text Search를 사용하고 locationBias를 적용
            if (keyword) {
                const response = await this.http.post<GoogleTextSearchResponse>(
                    '/places:searchText',
                    {
                        textQuery: keyword,
                        maxResultCount: 15,
                        locationBias: {
                            circle: {
                                center: {
                                    latitude: center.lat,
                                    longitude: center.lng,
                                },
                                radius,
                            },
                        },
                        rankPreference: 'DISTANCE',
                    },
                    {
                        headers: {
                            'X-Goog-FieldMask':
                                'places.id,places.displayName,places.formattedAddress,places.location',
                        },
                    },
                )

                return response.data.places
                    .map((place) => this.toPlace(place))
                    .filter((item): item is Place => item !== null)
            }

            // 키워드가 없으면 Nearby Search 사용
            const response = await this.http.post<GoogleNearbySearchResponse>(
                '/places:searchNearby',
                requestBody,
                {
                    headers: {
                        'X-Goog-FieldMask':
                            'places.id,places.displayName,places.formattedAddress,places.location',
                    },
                },
            )

            return response.data.places
                .map((place) => this.toPlace(place))
                .filter((item): item is Place => item !== null)
        } catch (error) {
            throw this.toProviderException('Failed to search nearby', error)
        }
    }

    /**
     * 주소를 좌표로 변환 (지오코딩)
     * @param address 주소 문자열
     * @returns GeoResult 객체 또는 null
     */
    async geocode(address: string): Promise<GeoResult | null> {
        try {
            const response = await axios.get<GoogleGeocodeResponse>(this.geocodeUrl, {
                params: {
                    address,
                    key: this.apiKey,
                },
            })

            if (response.data.status !== 'OK') {
                if (response.data.status === 'ZERO_RESULTS') {
                    return null
                }
                const code = response.data.status === 'REQUEST_DENIED' ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED'
                throw new ProviderException(
                    `Geocode failed: ${response.data.error_message || response.data.status}`,
                    this.providerName,
                    code,
                )
            }

            const result = response.data.results[0]
            if (!result) {
                return null
            }

            return this.toGeoResult(result)
        } catch (error) {
            throw this.toProviderException('Failed to geocode address', error)
        }
    }

    /**
     * Google Place 객체를 Place 객체로 변환
     * @param place Google Place 객체
     * @returns Place 객체 또는 null
     */
    private toPlace(place: GooglePlace): Place | null {
        if (!place.location) {
            return null
        }

        const lat = place.location.latitude
        const lng = place.location.longitude

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null
        }

        return {
            name: place.displayName?.text || '',
            address: place.formattedAddress || '',
            roadAddress: place.formattedAddress || '',
            lat,
            lng,
            provider: this.providerName,
            raw: place,
        }
    }

    /**
     * Google Geocoding 결과를 GeoResult 객체로 변환
     * @param result Google Geocoding 결과
     * @returns GeoResult 객체 또는 null
     */
    private toGeoResult(result: GoogleGeocodeResponse['results'][number]): GeoResult | null {
        const lat = result.geometry.location.lat
        const lng = result.geometry.location.lng

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null
        }

        return {
            lat,
            lng,
            provider: this.providerName,
            raw: result,
        }
    }

    /**
     * 반경을 Google API 제한 범위 내로 클램핑합니다.
     * Google Places API는 최대 50km까지 지원합니다.
     * @param radiusM 반경(미터)
     * @returns 클램핑된 반경(미터)
     */
    private clampRadius(radiusM: number): number {
        if (!Number.isFinite(radiusM)) {
            return 0
        }

        return Math.min(Math.max(Math.round(radiusM), 0), 50000)
    }

    /**
     * Provider 오류로 변환합니다.
     * @param message 오류 메시지
     * @param error 원본 오류
     * @returns ProviderException 객체
     */
    private toProviderException(message: string, error: unknown): ProviderException {
        if (error instanceof ProviderException) {
            return error
        }
        const code = this.determineErrorCode(error)
        const detail = error instanceof Error ? error.message : String(error)
        return new ProviderException(`${message}: ${detail}`, this.providerName, code)
    }

    /**
     * HTTP status와 Google ErrorInfo reason으로 credential 거부를 식별한다.
     */
    private determineErrorCode(error: unknown): 'AUTHENTICATION_FAILED' | 'REQUEST_FAILED' {
        if (!axios.isAxiosError(error)) return 'REQUEST_FAILED'
        const status = error.response?.status
        if (status === 401 || status === 403) return 'AUTHENTICATION_FAILED'
        if (status !== 400) return 'REQUEST_FAILED'
        const data: unknown = error.response?.data
        if (!data || typeof data !== 'object' || !('error' in data)) return 'REQUEST_FAILED'
        const payload = data.error
        if (!payload || typeof payload !== 'object' || !('details' in payload)) return 'REQUEST_FAILED'
        if (!Array.isArray(payload.details)) return 'REQUEST_FAILED'
        const hasInvalidApiKey = payload.details.some((detail: unknown) => (
            detail !== null
            && typeof detail === 'object'
            && 'reason' in detail
            && detail.reason === 'API_KEY_INVALID'
        ))
        return hasInvalidApiKey ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED'
    }
}
