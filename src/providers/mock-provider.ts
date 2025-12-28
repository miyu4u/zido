/**
 * Mock Provider - 고정된 테스트 데이터 반환
 * API 키 없이 개발/테스트 가능
 */
import type { Provider, Place, GeoResult } from './provider-types'

export class MockProvider implements Provider {
    name = 'mock'

    async resolve(query: string): Promise<Place | null> {
        // "가산동 주민센터" 예시에 맞춘 고정 데이터
        if (query.includes('가산동') || query.includes('주민센터')) {
            return {
                name: '가산동 주민센터',
                address: '서울특별시 금천구 가산동',
                roadAddress: '서울특별시 금천구 가산로 5',
                lat: 37.4785,
                lng: 126.8886,
                provider: this.name,
                raw: { query, mock: true },
            }
        }

        // 기본 응답
        return {
            name: `${query} (Mock)`,
            address: '서울특별시',
            roadAddress: '서울특별시',
            lat: 37.5665,
            lng: 126.978,
            provider: this.name,
            raw: { query, mock: true },
        }
    }

    async searchNearby(center: { lat: number; lng: number }, keyword: string, radiusM: number): Promise<Place[]> {
        // "사진관" 예시에 맞춘 고정 데이터
        const mockPlaces: Place[] = [
            {
                name: '가산동 사진관',
                address: '서울특별시 금천구 가산동 123-45',
                roadAddress: '서울특별시 금천구 가산로 10',
                lat: 37.479,
                lng: 126.889,
                provider: this.name,
                raw: { keyword, mock: true },
            },
            {
                name: '스튜디오 포토',
                address: '서울특별시 금천구 가산동 234-56',
                roadAddress: '서울특별시 금천구 가산로 20',
                lat: 37.478,
                lng: 126.887,
                provider: this.name,
                raw: { keyword, mock: true },
            },
            {
                name: '프로필 사진관',
                address: '서울특별시 금천구 가산동 345-67',
                roadAddress: '서울특별시 금천구 가산로 30',
                lat: 37.48,
                lng: 126.89,
                provider: this.name,
                raw: { keyword, mock: true },
            },
        ]

        return mockPlaces
    }

    async geocode(address: string): Promise<GeoResult | null> {
        // "서울" 예시에 맞춘 고정 데이터
        if (address.includes('서울')) {
            return {
                lat: 37.5665,
                lng: 126.978,
                provider: this.name,
                raw: { address, mock: true },
            }
        }

        // 기본 응답
        return {
            lat: 37.5665,
            lng: 126.978,
            provider: this.name,
            raw: { address, mock: true },
        }
    }
}
