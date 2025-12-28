/**
 * 환경변수 설정
 */
export const config = {
    server: {
        name: process.env.MCP_SERVER_NAME || 'zido',
        version: process.env.MCP_SERVER_VERSION || '1.0.0',
        httpPort: parseInt(process.env.MCP_HTTP_PORT || '8000', 10),
    },
    providers: {
        order: (process.env.PROVIDER_ORDER || 'kakao,naver,google').split(','),
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
