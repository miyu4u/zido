import 'dotenv/config'

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
    timeoutMs: parsePositiveInteger(process.env.CHARGER_PROVIDER_TIMEOUT_MS, 8_000),
    maxRetries: parseNonNegativeInteger(process.env.CHARGER_PROVIDER_MAX_RETRIES, 1),
    periodMinutes: parseBoundedInteger(process.env.CHARGER_STATUS_PERIOD_MINUTES, 5, 1, 10),
    regionCode: process.env.CHARGER_REGION_CODE || undefined,
    source: 'keco' as const,
    endpoint: process.env.KECO_API_ENDPOINT || 'https://apis.data.go.kr/B552584/EvCharger',
    serviceKey: process.env.KECO_SERVICE_KEY || '',
  },
} as const

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function parseBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}
