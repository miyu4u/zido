/**
 * Naver Maps API Provider (Stub)
 * TODO: 실제 구현 필요
 */
import type { Provider, Place, GeoResult } from './provider-types'
import { ProviderError } from '../infra/errors'

interface NaverProviderConfig {
    clientId: string
    clientSecret: string
}

export class NaverProvider implements Provider {
    private readonly clientId: string
    private readonly clientSecret: string

    constructor(config: NaverProviderConfig) {
        if (!config.clientId || !config.clientSecret) {
            throw new ProviderError('Naver Client ID and Secret are required', 'naver', 'MISSING_API_KEY')
        }
        this.clientId = config.clientId
        this.clientSecret = config.clientSecret
    }

    async resolve(query: string): Promise<Place | null> {
        // TODO: Naver Local Search API 구현
        throw new ProviderError('Naver provider not implemented yet', 'naver', 'NOT_IMPLEMENTED')
    }

    async searchNearby(center: { lat: number; lng: number }, keyword: string, radiusM: number): Promise<Place[]> {
        // TODO: Naver Local Search API 구현
        throw new ProviderError('Naver provider not implemented yet', 'naver', 'NOT_IMPLEMENTED')
    }

    async geocode(address: string): Promise<GeoResult | null> {
        // TODO: Naver Geocoding API 구현
        throw new ProviderError('Naver provider not implemented yet', 'naver', 'NOT_IMPLEMENTED')
    }
}
