/**
 * Redaction utility for external API URLs and sensitive strings.
 * Ensures ServiceKey or credentials never leak into logs, error messages, or cache keys.
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
 * Strips the entire query string from a URL, preserving the protocol, host, and path.
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
 * Redacts the complete query string from an external URL for logging/error reporting.
 * Preserves the path and completely removes all query parameters and secrets.
 */
export function redactFullUrlQuery(url: string | URL): string {
  return stripUrlQuery(url)
}

/**
 * Removes the complete external query string from a URL while also masking
 * credentials in arbitrary surrounding text.
 */
export function redactExternalUrl(url: string | URL): string {
  let str = typeof url === 'string' ? url : url.toString()
  str = stripExternalUrlQueries(str)
  return redactParameters(str)
}

/**
 * Sanitizes sensitive parameters from arbitrary text or error messages.
 * When stripQueries is true, completely removes query strings from external URLs in text.
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
