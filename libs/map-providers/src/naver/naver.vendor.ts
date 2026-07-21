import { Injectable } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { ProviderError } from 'zido/configuration'
import type { GeoResult, IHttpService, Place, Provider } from '../typed'
import type {
    NaverGeocodeAddress,
    NaverGeocodeResponse,
    NaverLocalSearchItem,
    NaverLocalSearchResponse,
    NaverProviderConfig,
} from './typed'

/**
 * Naver Local API Provider
 * 네이버 로컬 API를 사용하여 장소 검색 및 지오코딩
 */
@Injectable()
export class NaverVendor implements Provider, IHttpService {
    /**
     * Provider 식별자
     */
    private readonly providerName = 'naver'

    /**
     * Naver API 인증 정보
     */
    private readonly clientId: string
    private readonly clientSecret: string

    /**
     * API 엔드포인트 기본 URL
     */
    private readonly searchBaseUrl = 'https://openapi.naver.com/v1/search' // 장소 검색 API
    private readonly geocodeBaseUrl = 'https://naveropenapi.apigw.ntruss.com/map-geocode/v2' // 지오코딩 API

    /**
     * HTTP 클라이언트 인스턴스
     * - http: 장소 검색용 Axios 인스턴스
     * - geocodeHttp: 지오코딩용 Axios 인스턴스
     */
    public http: AxiosInstance
    private readonly geocodeHttp: AxiosInstance

    constructor(config: NaverProviderConfig) {
        if (!config.clientId || !config.clientSecret) {
            throw new ProviderError('Naver Client ID and Secret are required', 'naver', 'MISSING_API_KEY')
        }
        this.clientId = config.clientId
        this.clientSecret = config.clientSecret
        this.http = axios.create({
            baseURL: this.searchBaseUrl,
            headers: {
                'X-Naver-Client-Id': this.clientId,
                'X-Naver-Client-Secret': this.clientSecret,
            },
        })
        this.geocodeHttp = axios.create({
            baseURL: this.geocodeBaseUrl,
            headers: {
                'X-NCP-APIGW-API-KEY-ID': this.clientId,
                'X-NCP-APIGW-API-KEY': this.clientSecret,
            },
        })
    }

    /**
     * 장소 이름으로 위치를 검색합니다.
     * @param query 검색할 장소 이름
     * @returns Place 객체 또는 null
     */
    async resolve(query: string): Promise<Place | null> {
        try {
            const response = await this.http.get<NaverLocalSearchResponse>('/local.json', {
                params: {
                    query,
                    display: 1,
                    start: 1,
                },
            })

            const item = response.data.items?.[0]
            if (!item) {
                return null
            }

            return this.toPlace(item)
        } catch (error) {
            throw this.toProviderError('Failed to resolve place', error)
        }
    }

    /**
     * 주어진 좌표 주변의 장소를 검색합니다.
     * @param center 중심 좌표
     * @param keyword 검색 키워드
     * @param radiusM 반경(미터)
     * @returns Place 객체 배열
     */
    async searchNearby(center: { lat: number; lng: number }, keyword: string, radiusM: number): Promise<Place[]> {
        try {
            void center
            void radiusM

            const response = await this.http.get<NaverLocalSearchResponse>('/local.json', {
                params: {
                    query: keyword,
                    display: 5,
                    start: 1,
                },
            })

            return response.data.items.map((item) => this.toPlace(item)).filter((item): item is Place => item !== null)
        } catch (error) {
            throw this.toProviderError('Failed to search nearby', error)
        }
    }

    /**
     * 주소를 좌표로 변환합니다.
     * @param address 변환할 주소
     * @returns GeoResult 객체 또는 null
     */
    async geocode(address: string): Promise<GeoResult | null> {
        try {
            const response = await this.geocodeHttp.get<NaverGeocodeResponse>('/geocode', {
                params: {
                    query: address,
                },
            })

            if (response.data.status && response.data.status !== 'OK') {
                throw new ProviderError(
                    `Geocode failed: ${response.data.errorMessage || response.data.status}`,
                    this.providerName,
                    'REQUEST_FAILED',
                )
            }

            const doc = response.data.addresses?.[0]
            if (!doc) {
                return null
            }

            return this.toGeoResult(doc)
        } catch (error) {
            throw this.toProviderError('Failed to geocode address', error)
        }
    }


    /**
     * Naver API 응답을 Place 객체로 변환합니다.
     * @param item Naver API 응답 아이템
     * @returns Place 객체 또는 null
     */
    private toPlace(item: NaverLocalSearchItem): Place | null {
        const lat = this.normalizeCoordinate(item.mapy, 90)
        const lng = this.normalizeCoordinate(item.mapx, 180)

        if (lat === null || lng === null) {
            return null
        }

        return {
            name: this.stripHtml(item.title).trim() || item.title,
            address: item.address,
            roadAddress: item.roadAddress || '',
            lat,
            lng,
            provider: this.providerName,
            raw: item,
        }
    }

    /**
     * Naver Geocode 응답을 GeoResult 객체로 변환합니다.
     * @param doc Naver Geocode 응답 문서
     * @returns GeoResult 객체 또는 null
     */
    private toGeoResult(doc: NaverGeocodeAddress): GeoResult | null {
        const lat = this.normalizeCoordinate(doc.y, 90)
        const lng = this.normalizeCoordinate(doc.x, 180)

        if (lat === null || lng === null) {
            return null
        }

        return {
            lat,
            lng,
            provider: this.providerName,
            raw: doc,
        }
    }

    /**
     * 좌표 값을 정규화합니다.
     * @param value 좌표 값 (문자열)
     * @param maxAbs 최대 절대값
     * @returns 정규화된 좌표 값 또는 null
     */
    private normalizeCoordinate(value: string, maxAbs: number): number | null {
        const parsed = Number.parseFloat(value)
        if (!Number.isFinite(parsed)) {
            return null
        }

        if (Math.abs(parsed) <= maxAbs) {
            return parsed
        }

        const scaled = parsed / 1e7
        if (Math.abs(scaled) <= maxAbs) {
            return scaled
        }

        return null
    }

    /**
     * HTML 태그를 제거합니다.
     * @param value HTML이 포함된 문자열
     * @returns HTML이 제거된 문자열
     */
    private stripHtml(value: string): string {
        return value.replace(/<[^>]+>/g, '')
    }

    /**
     * Provider 오류로 변환합니다.
     * @param message 오류 메시지
     * @param error 원본 오류
     * @returns ProviderError 객체
     */
    private toProviderError(message: string, error: unknown): ProviderError {
        const detail = error instanceof Error ? error.message : String(error)
        return new ProviderError(`${message}: ${detail}`, this.providerName, 'REQUEST_FAILED')
    }
}
