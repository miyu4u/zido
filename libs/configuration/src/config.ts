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
} as const
