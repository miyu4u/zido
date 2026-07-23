
/**
 * 문자열 길이 제한 검증
 */
export function validateStringLength(input: string, minLength: number, maxLength: number): boolean {
    if (typeof input !== 'string') return false
    return input.length >= minLength && input.length <= maxLength
}

/**
 * 특수문자 필터링 (XSS 방어)
 */
export function sanitizeString(input: string): string {
    if (typeof input !== 'string') return ''

    return input
        .replace(/[<>]/g, '') // HTML 태그 제거
        .replace(/javascript:/gi, '') // JavaScript 프로토콜 제거
        .replace(/on\w+=/gi, '') // 이벤트 핸들러 제거
        .trim()
}

/**
 * 좌표 값 검증
 */
export function validateCoordinates(lat: number, lng: number): boolean {
    return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180 &&
        !isNaN(lat) &&
        !isNaN(lng) &&
        isFinite(lat) &&
        isFinite(lng)
    )
}

/**
 * 반경 값 검증 (미터)
 */
export function validateRadius(radiusM: number): boolean {
    return (
        typeof radiusM === 'number' &&
        radiusM > 0 &&
        radiusM <= 50000 && // 최대 50km 제한
        !isNaN(radiusM) &&
        isFinite(radiusM)
    )
}

/**
 * 검색어 검증
 */
export function validateSearchQuery(query: string): { valid: boolean; sanitized?: string; error?: string } {
    if (typeof query !== 'string') {
        return { valid: false, error: 'Query must be a string' }
    }

    if (!validateStringLength(query, 1, 100)) {
        return { valid: false, error: 'Query length must be between 1 and 100 characters' }
    }

    const sanitized = sanitizeString(query)

    if (!sanitized || sanitized.length === 0) {
        return { valid: false, error: 'Query contains invalid characters' }
    }

    return { valid: true, sanitized }
}

/**
 * 주소 검증
 */
export function validateAddress(address: string): { valid: boolean; sanitized?: string; error?: string } {
    if (typeof address !== 'string') {
        return { valid: false, error: 'Address must be a string' }
    }

    if (!validateStringLength(address, 1, 200)) {
        return { valid: false, error: 'Address length must be between 1 and 200 characters' }
    }

    const sanitized = sanitizeString(address)

    if (!sanitized || sanitized.length === 0) {
        return { valid: false, error: 'Address contains invalid characters' }
    }

    return { valid: true, sanitized }
}
