/**
 * 입력값이 문자열인지 확인하고, 문자열 길이가 지정한 최소값과 최대값을 모두 포함하는 범위에 있는지 검증합니다.
 *
 * @param input 길이를 검사할 문자열입니다. runtime에서 문자열이 아닌 값이 전달되면 유효하지 않은 것으로 처리합니다.
 * @param minLength 허용할 최소 문자열 길이입니다. 해당 길이와 같은 문자열도 유효합니다.
 * @param maxLength 허용할 최대 문자열 길이입니다. 해당 길이와 같은 문자열도 유효합니다.
 * @returns 입력값이 문자열이고 길이가 `minLength` 이상 `maxLength` 이하이면 `true`, 그렇지 않으면 `false`입니다.
 */
export function validateStringLength(input: string, minLength: number, maxLength: number): boolean {
  if (typeof input !== 'string') return false
  return input.length >= minLength && input.length <= maxLength
}

/**
 * 사용자 입력에서 HTML 태그 구분 문자, JavaScript protocol 문자열, inline event handler 형태를 제거하고 양끝 공백을 정리합니다.
 *
 * 이 함수는 검색어와 주소에 포함된 대표적인 실행 가능 문자열을 제한하기 위한 기본 정제 과정이며,
 * 모든 XSS 공격을 차단하는 범용 HTML sanitizer를 대신하지 않습니다.
 *
 * @param input 정제할 문자열입니다. runtime에서 문자열이 아닌 값이 전달되면 빈 문자열로 처리합니다.
 * @returns 위험 가능성이 있는 문자열 pattern과 양끝 공백을 제거한 문자열입니다.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return ''

  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
}

/**
 * 위도와 경도가 숫자이며 유한한 값인지 확인하고, 지리 좌표의 허용 범위 안에 있는지 검증합니다.
 *
 * 위도는 양극을 포함한 -90도 이상 90도 이하, 경도는 날짜 변경선을 포함한 -180도 이상 180도 이하를 허용합니다.
 * `NaN`, `Infinity`, `-Infinity`와 runtime에서 전달된 숫자가 아닌 값은 유효하지 않습니다.
 *
 * @param lat 검증할 위도 값입니다.
 * @param lng 검증할 경도 값입니다.
 * @returns 두 값이 모두 유한한 숫자이고 각각의 좌표 범위 안에 있으면 `true`, 그렇지 않으면 `false`입니다.
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
 * 장소 검색에 사용할 반경이 미터 단위의 유한한 양수이며 서비스 허용 한도인 50km를 넘지 않는지 검증합니다.
 *
 * 0과 음수, 50,000m를 초과하는 값, `NaN`, `Infinity`, `-Infinity`,
 * runtime에서 전달된 숫자가 아닌 값은 유효하지 않습니다.
 *
 * @param radiusM 검증할 검색 반경의 미터 단위 값입니다.
 * @returns 반경이 0m보다 크고 50,000m 이하인 유한한 숫자이면 `true`, 그렇지 않으면 `false`입니다.
 */
export function validateRadius(radiusM: number): boolean {
  return typeof radiusM === 'number' && radiusM > 0 && radiusM <= 50000 && !isNaN(radiusM) && isFinite(radiusM)
}

/**
 * 장소 검색어가 문자열이고 1자 이상 100자 이하인지 확인한 뒤, 실행 가능성이 있는 문자열 pattern을 제거합니다.
 *
 * 원본 문자열의 type과 길이를 먼저 검증하며, 정제 결과가 빈 문자열이면 검색에 사용할 수 없는 입력으로 처리합니다.
 * 성공 결과에는 정제된 검색어가 포함되고, 실패 결과에는 호출자가 원인을 구분할 수 있는 error message가 포함됩니다.
 *
 * @param query 검증하고 정제할 장소 검색어입니다.
 * @returns 유효하면 `{ valid: true, sanitized }`, 유효하지 않으면 `{ valid: false, error }` 형식의 결과입니다.
 */
export function validateSearchQuery(query: string): {
  valid: boolean
  sanitized?: string
  error?: string
} {
  if (typeof query !== 'string') {
    return { valid: false, error: 'Query must be a string' }
  }

  if (!validateStringLength(query, 1, 100)) {
    return {
      valid: false,
      error: 'Query length must be between 1 and 100 characters',
    }
  }

  const sanitized = sanitizeString(query)

  if (!sanitized || sanitized.length === 0) {
    return { valid: false, error: 'Query contains invalid characters' }
  }

  return { valid: true, sanitized }
}

/**
 * geocoding에 사용할 주소가 문자열이고 1자 이상 200자 이하인지 확인한 뒤, 실행 가능성이 있는 문자열 pattern을 제거합니다.
 *
 * 원본 문자열의 type과 길이를 먼저 검증하며, 정제 결과가 빈 문자열이면 주소로 사용할 수 없는 입력으로 처리합니다.
 * 성공 결과에는 정제된 주소가 포함되고, 실패 결과에는 호출자가 원인을 구분할 수 있는 error message가 포함됩니다.
 *
 * @param address 검증하고 정제할 주소 문자열입니다.
 * @returns 유효하면 `{ valid: true, sanitized }`, 유효하지 않으면 `{ valid: false, error }` 형식의 결과입니다.
 */
export function validateAddress(address: string): {
  valid: boolean
  sanitized?: string
  error?: string
} {
  if (typeof address !== 'string') {
    return { valid: false, error: 'Address must be a string' }
  }

  if (!validateStringLength(address, 1, 200)) {
    return {
      valid: false,
      error: 'Address length must be between 1 and 200 characters',
    }
  }

  const sanitized = sanitizeString(address)

  if (!sanitized || sanitized.length === 0) {
    return { valid: false, error: 'Address contains invalid characters' }
  }

  return { valid: true, sanitized }
}
