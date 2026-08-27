import 'dotenv/config'

/**
 * KECO API가 zcode로 허용하는 시·도 code의 canonical 집합이다.
 */
export const KECO_REGION_CODES = [
  '11',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '36',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '50',
] as const

const KECO_REGION_CODE_SET = new Set<string>(KECO_REGION_CODES)

/**
 * 엔드포인트 URL 환경변수를 파싱하고 유효하지 않거나 누락된 경우 기본 엔드포인트로 병합(coalesce)한다.
 *
 * @param value 환경변수 문자열
 * @param fallback 기본 엔드포인트 URL
 * @returns 정규화된 엔드포인트 URL 문자열
 */
function parseEndpoint(value: string | undefined, fallback: string): string {
  if (!value || typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return fallback
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback
    }
    return trimmed
  } catch {
    return fallback
  }
}

/**
 * 양의 정수 환경변수를 파싱하고 유효하지 않은 경우 기본값으로 병합한다.
 *
 * @param value 환경변수 문자열
 * @param fallback 기본 양의 정수값
 * @returns 양의 정수값
 */
function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * 0 이상의 정수 환경변수를 파싱하고 유효하지 않은 경우 기본값으로 병합한다.
 *
 * @param value 환경변수 문자열
 * @param fallback 기본 0 이상 정수값
 * @returns 0 이상의 정수값
 */
function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * 범위 제한 정수 환경변수를 파싱하고 유효하지 않은 경우 기본값으로 병합한다.
 *
 * @param value 환경변수 문자열
 * @param fallback 기본값
 * @param minimum 최소 허용 정수값
 * @param maximum 최대 허용 정수값
 * @returns 범위 내 정수값
 */
function parseBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

/**
 * 콤마로 구분된 2자리 시·도 코드 목록을 파싱하고 정규화(검증, 정렬 및 중복 제거)한다.
 *
 * @param value 환경변수 문자열
 * @returns 정규화된 2자리 시·도 코드 배열
 */
export function parseRegionCodes(value: string | undefined): string[] {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return []
  }
  const parts = value.split(',').map((part) => part.trim())
  for (const part of parts) {
    if (!KECO_REGION_CODE_SET.has(part)) {
      throw new Error(`Invalid region code in CHARGER_DEFAULT_REGION_CODES: "${part}".`)
    }
  }
  return Array.from(new Set(parts)).sort()
}

/**
 * 애플리케이션 전역에서 공유하는 환경변수 설정을 한 번만 해석한다.
 */
export const config = {
  /**
   * 서버 식별자와 HTTP listener 설정이다.
   */
  server: {
    name: process.env.MCP_SERVER_NAME || 'zido',
    version: process.env.MCP_SERVER_VERSION || '1.0.0',
    httpPort: parseInt(process.env.MCP_HTTP_PORT || '8000', 10),
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  },
  /**
   * provider fallback 순서와 각 provider의 credential 설정이다.
   */
  providers: {
    order: (process.env.PROVIDER_ORDER || 'kakao,naver').split(','),
    kakao: {
      restKey: process.env.KAKAO_REST_KEY || '',
    },
    naver: {
      clientId: process.env.NAVER_CLIENT_ID || '',
      clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY || '',
    },
  },
  /**
   * 충전 상태 cache-aside 수집과 로컬 snapshot 저장 설정이다.
   */
  charger: {
    sqlitePath: process.env.CHARGER_SQLITE_PATH || './.data/charger-snapshots.sqlite',
    ttlMs: parsePositiveInteger(process.env.CHARGER_CACHE_TTL_MS, 300_000),
    timeoutMs: parsePositiveInteger(process.env.KECO_API_TIMEOUT, 8_000),
    maxRetries: parseNonNegativeInteger(process.env.CHARGER_PROVIDER_MAX_RETRIES, 1),
    periodMinutes: parseBoundedInteger(process.env.CHARGER_STATUS_PERIOD_MINUTES, 5, 1, 10),
    defaultRegionCodes: parseRegionCodes(process.env.CHARGER_DEFAULT_REGION_CODES),
    allowNationwideCollection: process.env.CHARGER_ALLOW_NATIONWIDE_COLLECTION === 'true',
    source: 'keco' as const,
    endpoint: parseEndpoint(process.env.KECO_API_URL, 'https://apis.data.go.kr/B552584/EvCharger'),
    serviceKey: process.env.KECO_API_KEY || '',
  },
} as const
