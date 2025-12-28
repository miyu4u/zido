/**
 * Google Places API Provider (Stub)
 * TODO: 실제 구현 필요
 */
import type { Provider, Place, GeoResult } from './provider-types'
import { ProviderError } from '../infra/errors'

interface GoogleProviderConfig {
    apiKey: string
}

export class GoogleProvider implements Provider {
    private readonly apiKey: string

    constructor(config: GoogleProviderConfig) {
        if (!config.apiKey) {
            throw new ProviderError('Google API key is required', 'google', 'MISSING_API_KEY')
        }
        this.apiKey = config.apiKey
    }

    async resolve(query: string): Promise<Place | null> {
        // TODO: Google Places API Text Search 구현
        throw new ProviderError('Google provider not implemented yet', 'google', 'NOT_IMPLEMENTED')
    }

    async searchNearby(center: { lat: number; lng: number }, keyword: string, radiusM: number): Promise<Place[]> {
        // TODO: Google Places API Nearby Search 구현
        throw new ProviderError('Google provider not implemented yet', 'google', 'NOT_IMPLEMENTED')
    }

    async geocode(address: string): Promise<GeoResult | null> {
        // TODO: Google Geocoding API 구현
        throw new ProviderError('Google provider not implemented yet', 'google', 'NOT_IMPLEMENTED')
    }
}
