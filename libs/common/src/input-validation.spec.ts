import {
    validateStringLength,
    sanitizeString,
    validateCoordinates,
    validateRadius,
    validateSearchQuery,
    validateAddress,
} from './input-validation'

describe('validateStringLength', () => {
    it('올바른 범위 내의 문자열 길이에 대해 true를 반환한다', () => {
        expect(validateStringLength('hello', 3, 5)).toBe(true)
    })

    it('문자열 길이가 최소값 경계에 있을 때 true를 반환한다', () => {
        expect(validateStringLength('abc', 3, 5)).toBe(true)
    })

    it('문자열 길이가 최대값 경계에 있을 때 true를 반환한다', () => {
        expect(validateStringLength('abcde', 3, 5)).toBe(true)
    })

    it('문자열 길이가 최소값보다 작을 때 false를 반환한다', () => {
        expect(validateStringLength('ab', 3, 5)).toBe(false)
    })

    it('문자열 길이가 최대값보다 클 때 false를 반환한다', () => {
        expect(validateStringLength('abcdef', 3, 5)).toBe(false)
    })

    it('문자열 타입이 아닐 경우 false를 반환한다', () => {
        expect(validateStringLength(null as unknown as string, 0, 10)).toBe(false)
        expect(validateStringLength(undefined as unknown as string, 0, 10)).toBe(false)
        expect(validateStringLength(123 as unknown as string, 0, 10)).toBe(false)
        expect(validateStringLength({} as unknown as string, 0, 10)).toBe(false)
    })
})

describe('sanitizeString', () => {
    it('특수문자가 없는 경우 그대로 반환하고 양 끝 공백을 제거한다', () => {
        expect(sanitizeString('  hello  ')).toBe('hello')
    })

    it('HTML 태그(<, >)를 제거한다', () => {
        expect(sanitizeString('abc<def>ghi')).toBe('abcdefghi')
        expect(sanitizeString('<script>')).toBe('script')
    })

    it('대소문자 구분 없이 javascript: 프로토콜을 제거한다', () => {
        expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)')
        expect(sanitizeString('JAVASCRIPT:alert(2)')).toBe('alert(2)')
    })

    it('대소문자 구분 없이 on[word]= 형태의 이벤트 핸들러를 제거한다', () => {
        expect(sanitizeString('onclick=alert(1)')).toBe('alert(1)')
        expect(sanitizeString('onMouseOver=foo')).toBe('foo')
        expect(sanitizeString('onchange=')).toBe('')
    })

    it('문자열 타입이 아닐 경우 빈 문자열을 반환한다', () => {
        expect(sanitizeString(null as unknown as string)).toBe('')
        expect(sanitizeString(undefined as unknown as string)).toBe('')
        expect(sanitizeString(123 as unknown as string)).toBe('')
        expect(sanitizeString({} as unknown as string)).toBe('')
    })
})

describe('validateCoordinates', () => {
    it('올바른 범위 내의 위도와 경도에 대해 true를 반환한다', () => {
        expect(validateCoordinates(37.5, 127.0)).toBe(true)
    })

    it('위도와 경도가 정확히 최대/최소 경계값일 때 true를 반환한다', () => {
        expect(validateCoordinates(-90, -180)).toBe(true)
        expect(validateCoordinates(90, 180)).toBe(true)
    })

    it('위도가 범위를 벗어나면 false를 반환한다', () => {
        expect(validateCoordinates(-90.1, 127.0)).toBe(false)
        expect(validateCoordinates(90.1, 127.0)).toBe(false)
    })

    it('경도가 범위를 벗어나면 false를 반환한다', () => {
        expect(validateCoordinates(37.5, -180.1)).toBe(false)
        expect(validateCoordinates(37.5, 180.1)).toBe(false)
    })

    it('위도 또는 경도가 NaN이면 false를 반환한다', () => {
        expect(validateCoordinates(NaN, 127.0)).toBe(false)
        expect(validateCoordinates(37.5, NaN)).toBe(false)
        expect(validateCoordinates(NaN, NaN)).toBe(false)
    })

    it('위도 또는 경도가 Infinity 또는 -Infinity이면 false를 반환한다', () => {
        expect(validateCoordinates(Infinity, 127.0)).toBe(false)
        expect(validateCoordinates(37.5, -Infinity)).toBe(false)
        expect(validateCoordinates(-Infinity, Infinity)).toBe(false)
    })

    it('위도 또는 경도가 숫자 타입이 아니면 false를 반환한다', () => {
        expect(validateCoordinates('37.5' as unknown as number, 127.0)).toBe(false)
        expect(validateCoordinates(37.5, null as unknown as number)).toBe(false)
        expect(validateCoordinates(undefined as unknown as number, 127.0)).toBe(false)
    })
})

describe('validateRadius', () => {
    it('올바른 범위 내의 반경에 대해 true를 반환한다', () => {
        expect(validateRadius(100)).toBe(true)
        expect(validateRadius(49999)).toBe(true)
    })

    it('반경이 정확히 최대 경계값(50000)일 때 true를 반환한다', () => {
        expect(validateRadius(50000)).toBe(true)
    })

    it('반경이 0이거나 음수이면 false를 반환한다', () => {
        expect(validateRadius(0)).toBe(false)
        expect(validateRadius(-1)).toBe(false)
    })

    it('반경이 최대값(50000)을 초과하면 false를 반환한다', () => {
        expect(validateRadius(50000.1)).toBe(false)
    })

    it('반경이 NaN이면 false를 반환한다', () => {
        expect(validateRadius(NaN)).toBe(false)
    })

    it('반경이 Infinity 또는 -Infinity이면 false를 반환한다', () => {
        expect(validateRadius(Infinity)).toBe(false)
        expect(validateRadius(-Infinity)).toBe(false)
    })

    it('반경이 숫자 타입이 아니면 false를 반환한다', () => {
        expect(validateRadius('100' as unknown as number)).toBe(false)
        expect(validateRadius(null as unknown as number)).toBe(false)
        expect(validateRadius(undefined as unknown as number)).toBe(false)
    })
})

describe('validateSearchQuery', () => {
    it('올바른 검색어에 대해 valid: true와 정제된 검색어를 반환한다', () => {
        expect(validateSearchQuery(' 카페 ')).toEqual({
            valid: true,
            sanitized: '카페',
        })
    })

    it('HTML 태그가 포함된 검색어를 정제하여 반환한다', () => {
        expect(validateSearchQuery('<script>카페</script>')).toEqual({
            valid: true,
            sanitized: 'script카페/script',
        })
    })

    it('문자열 타입이 아닐 경우 에러 객체를 반환한다', () => {
        expect(validateSearchQuery(null as unknown as string)).toEqual({
            valid: false,
            error: 'Query must be a string',
        })
        expect(validateSearchQuery(123 as unknown as string)).toEqual({
            valid: false,
            error: 'Query must be a string',
        })
    })

    it('길이 제한(1 ~ 100글자)을 벗어날 경우 에러 객체를 반환한다', () => {
        expect(validateSearchQuery('')).toEqual({
            valid: false,
            error: 'Query length must be between 1 and 100 characters',
        })
        expect(validateSearchQuery('a'.repeat(101))).toEqual({
            valid: false,
            error: 'Query length must be between 1 and 100 characters',
        })
    })

    it('정확히 1글자 혹은 100글자의 검색어는 성공한다', () => {
        expect(validateSearchQuery('a')).toEqual({
            valid: true,
            sanitized: 'a',
        })
        const maxQuery = 'a'.repeat(100)
        expect(validateSearchQuery(maxQuery)).toEqual({
            valid: true,
            sanitized: maxQuery,
        })
    })

    it('정제 후 빈 문자열이 되는 경우 에러 객체를 반환한다', () => {
        expect(validateSearchQuery('<>')).toEqual({
            valid: false,
            error: 'Query contains invalid characters',
        })
        expect(validateSearchQuery('javascript:')).toEqual({
            valid: false,
            error: 'Query contains invalid characters',
        })
    })
})

describe('validateAddress', () => {
    it('올바른 주소에 대해 valid: true와 정제된 주소를 반환한다', () => {
        expect(validateAddress(' 서울시 강남구 ')).toEqual({
            valid: true,
            sanitized: '서울시 강남구',
        })
    })

    it('HTML 태그가 포함된 주소를 정제하여 반환한다', () => {
        expect(validateAddress('서울시 <강남구>')).toEqual({
            valid: true,
            sanitized: '서울시 강남구',
        })
    })

    it('문자열 타입이 아닐 경우 에러 객체를 반환한다', () => {
        expect(validateAddress(null as unknown as string)).toEqual({
            valid: false,
            error: 'Address must be a string',
        })
        expect(validateAddress(123 as unknown as string)).toEqual({
            valid: false,
            error: 'Address must be a string',
        })
    })

    it('길이 제한(1 ~ 200글자)을 벗어날 경우 에러 객체를 반환한다', () => {
        expect(validateAddress('')).toEqual({
            valid: false,
            error: 'Address length must be between 1 and 200 characters',
        })
        expect(validateAddress('a'.repeat(201))).toEqual({
            valid: false,
            error: 'Address length must be between 1 and 200 characters',
        })
    })

    it('정확히 1글자 혹은 200글자의 주소는 성공한다', () => {
        expect(validateAddress('a')).toEqual({
            valid: true,
            sanitized: 'a',
        })
        const maxAddress = 'a'.repeat(200)
        expect(validateAddress(maxAddress)).toEqual({
            valid: true,
            sanitized: maxAddress,
        })
    })

    it('정제 후 빈 문자열이 되는 경우 에러 객체를 반환한다', () => {
        expect(validateAddress('<>')).toEqual({
            valid: false,
            error: 'Address contains invalid characters',
        })
        expect(validateAddress('javascript:')).toEqual({
            valid: false,
            error: 'Address contains invalid characters',
        })
    })
})
