/**
 * KECO API URL 및 민감 문자열 마스킹(redaction) 유틸리티.
 * ServiceKey, 인증 토큰 등의 자격증명이 로그나 에러 메시지 등에 유출되지 않도록 처리한다.
 */

const SERVICE_KEY_PATTERNS = [
  /([?&]serviceKey=)[^&]*/gi,
  /([?&]ServiceKey=)[^&]*/gi,
  /([?&](?:apiKey|ApiKey|key|Key|secret|token|password|auth)=)[^&]*/gi,
  /(serviceKey%3D)[^&%]+/gi,
  /(ServiceKey%3D)[^&%]+/gi,
  /((?:apiKey|ApiKey|key|Key|secret|token|password|auth)%3D)[^&%]+/gi,
  /((?:authorization|proxy-authorization)\s*[:=]\s*)(?:bearer\s+)?[^,\s]+/gi,
  /(bearer\s+)[^,\s]+/gi,
]

/**
 * URL에서 쿼리스트링 전체를 제거하고 프로토콜, 호스트, 경로만 보존한다.
 *
 * @param url 대상 URL 문자열 또는 URL 객체
 * @returns 쿼리스트링이 제거된 URL 문자열
 */
export function stripUrlQuery(url: string | URL): string {
  const str = typeof url === 'string' ? url : url.toString()
  try {
    const parsed = new URL(str)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return str.split('?')[0]
  }
}

/**
 * 외부 URL에서 모든 쿼리 파라미터를 완전히 제거하여 안전한 로깅용 URL을 생성한다.
 *
 * @param url 대상 URL 문자열 또는 URL 객체
 * @returns 쿼리스트링이 제거된 안전한 URL 문자열
 */
export function redactFullUrlQuery(url: string | URL): string {
  return stripUrlQuery(url)
}

/**
 * 외부 URL의 쿼리스트링을 제거하고 주변 텍스트의 민감 파라미터를 마스킹한다.
 *
 * @param url 대상 URL 문자열 또는 URL 객체
 * @returns 마스킹 처리된 URL 문자열
 */
export function redactExternalUrl(url: string | URL): string {
  let str = typeof url === 'string' ? url : url.toString()
  str = stripExternalUrlQueries(str)
  return redactParameters(str)
}

/**
 * 임의의 텍스트나 에러 메시지에서 민감한 인증 정보 및 쿼리스트링을 마스킹한다.
 *
 * @param text 마스킹 대상 원본 문자열
 * @param options 마스킹 옵션 (stripQueries가 false가 아니면 URL 쿼리 전체 제거)
 * @returns 마스킹 처리된 안전한 문자열
 */
export function redactSensitiveText(text: string, options?: { stripQueries?: boolean }): string {
  const str = options?.stripQueries === false ? text : stripExternalUrlQueries(text)
  return redactParameters(str)
}

function stripExternalUrlQueries(text: string): string {
  return text.replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?/gi, (candidate) => stripUrlQuery(candidate))
}

function redactParameters(text: string): string {
  let result = text
  for (const pattern of SERVICE_KEY_PATTERNS) {
    result = result.replace(pattern, '$1[REDACTED]')
  }
  return result
}
