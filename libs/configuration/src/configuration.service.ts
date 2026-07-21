import { Injectable } from '@nestjs/common'
import 'dotenv/config'

/**
 * MCP 서버와 지도 provider가 공유하는 환경 설정을 한 번만 해석한다.
 */
@Injectable()
export class ConfigurationService {
    /** 서버 식별자와 HTTP listener 설정이다. */
    readonly server = {
        name: process.env.MCP_SERVER_NAME || 'zido',
        version: process.env.MCP_SERVER_VERSION || '1.0.0',
        httpPort: parseInt(process.env.MCP_HTTP_PORT || '8000', 10),
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    } as const

    /** provider fallback 순서와 각 provider의 credential 설정이다. */
    readonly providers = {
        order: (process.env.PROVIDER_ORDER || 'kakao,naver').split(','),
        kakao: { restKey: process.env.KAKAO_REST_KEY || '' },
        naver: {
            clientId: process.env.NAVER_CLIENT_ID || '',
            clientSecret: process.env.NAVER_CLIENT_SECRET || '',
        },
        google: { apiKey: process.env.GOOGLE_API_KEY || '' },
    } as const

    /** transport 선택값을 읽어 stdio/http 외의 값은 HTTP로 처리한다. */
    get transport(): 'stdio' | 'http' {
        return process.env.MCP_TRANSPORT === 'stdio' ? 'stdio' : 'http'
    }
}
