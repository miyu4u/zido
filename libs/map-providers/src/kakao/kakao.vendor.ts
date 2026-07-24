import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ProviderException } from 'zido/common';
import type { GeoResult, IHttpService, Place, Provider } from '../typed';
import type {
  KakaoAddressSearchResponse,
  KakaoKeywordSearchResponse,
  KakaoPlaceDocument,
  KakaoProviderConfig,
} from './typed';

/**
 * Kakao Local API Provider
 * 카카오 로컬 API를 사용하여 장소 검색 및 지오코딩
 */
@Injectable()
export class KakaoVendor implements Provider, IHttpService {
  private readonly providerName = 'kakao';
  private readonly restKey: string;
  private readonly baseUrl = 'https://dapi.kakao.com/v2/local';
  public http: AxiosInstance;

  constructor(config: KakaoProviderConfig) {
    if (!config.restKey) {
      throw new ProviderException(
        'Kakao REST API key is required',
        'kakao',
        'MISSING_API_KEY',
      );
    }
    this.restKey = config.restKey;
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `KakaoAK ${this.restKey}`,
      },
    });
  }

  /**
   * 장소를 검색합니다.
   * @param query 검색어
   * @returns Place 객체 또는 null
   */
  async resolve(query: string): Promise<Place | null> {
    try {
      const response = await this.http.get<KakaoKeywordSearchResponse>(
        '/search/keyword.json',
        {
          params: {
            query,
            size: 1,
          },
        },
      );

      const doc = response.data.documents[0];
      if (!doc) {
        return null;
      }

      return this.toPlace(doc);
    } catch (error) {
      throw this.toProviderException('Failed to resolve place', error);
    }
  }

  /**
   * 주어진 좌표 주변의 장소를 검색합니다.
   * @param center 중심 좌표
   * @param keyword 검색어
   * @param radiusM 반경(미터)
   * @returns Place 객체 배열
   */
  async searchNearby(
    center: { lat: number; lng: number },
    keyword: string,
    radiusM: number,
  ): Promise<Place[]> {
    try {
      const radius = this.clampRadius(radiusM);
      const response = await this.http.get<KakaoKeywordSearchResponse>(
        '/search/keyword.json',
        {
          params: {
            query: keyword,
            x: center.lng,
            y: center.lat,
            radius,
            size: 15,
            sort: 'distance',
          },
        },
      );

      return response.data.documents
        .map((doc) => this.toPlace(doc))
        .filter((item): item is Place => item !== null);
    } catch (error) {
      throw this.toProviderException('Failed to search nearby', error);
    }
  }

  /**
   * 주소를 좌표로 변환합니다.
   * @param address 주소
   * @returns GeoResult 객체 또는 null
   */
  async geocode(address: string): Promise<GeoResult | null> {
    try {
      const response = await this.http.get<KakaoAddressSearchResponse>(
        '/search/address.json',
        {
          params: {
            query: address,
            size: 1,
          },
        },
      );

      const doc = response.data.documents[0];
      if (!doc) {
        return null;
      }

      return this.toGeoResult(doc);
    } catch (error) {
      throw this.toProviderException('Failed to geocode address', error);
    }
  }

  /**
   * Kakao 장소 문서를 Place 객체로 변환합니다.
   * @param doc Kakao 장소 문서
   * @returns Place 객체 또는 null
   */
  private toPlace(doc: KakaoPlaceDocument): Place | null {
    const lat = Number.parseFloat(doc.y);
    const lng = Number.parseFloat(doc.x);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }

    return {
      name: doc.place_name,
      address: doc.address_name,
      roadAddress: doc.road_address_name || '',
      lat,
      lng,
      provider: this.providerName,
      raw: doc,
    };
  }

  /**
   * Kakao 주소 문서를 GeoResult 객체로 변환합니다.
   * @param doc Kakao 주소 문서
   * @returns GeoResult 객체 또는 null
   */
  private toGeoResult(
    doc: KakaoAddressSearchResponse['documents'][number],
  ): GeoResult | null {
    const lat = Number.parseFloat(doc.y);
    const lng = Number.parseFloat(doc.x);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }

    return {
      lat,
      lng,
      provider: this.providerName,
      raw: doc,
    };
  }

  /**
   * 반경을 Kakao API 제한 범위 내로 클램핑합니다.
   * Kakao API는 최대 20km까지 지원합니다.
   * @param radiusM 반경(미터)
   * @returns 클램핑된 반경(미터)
   */
  private clampRadius(radiusM: number): number {
    if (!Number.isFinite(radiusM)) {
      return 0;
    }

    return Math.min(Math.max(Math.round(radiusM), 0), 20000);
  }

    /**
     * 이미 분류된 provider 오류를 보존하고 HTTP 인증 실패만 별도 code로 변환한다.
     */
    private toProviderException(message: string, error: unknown): ProviderException {
        if (error instanceof ProviderException) return error
        const detail = error instanceof Error ? error.message : String(error)
        const status = axios.isAxiosError(error) ? error.response?.status : undefined
        const code = status === 401 || status === 403
            ? 'AUTHENTICATION_FAILED'
            : 'REQUEST_FAILED'
        return new ProviderException(`${message}: ${detail}`, this.providerName, code)
    }
}
