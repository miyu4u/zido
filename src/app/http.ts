/**
 * HTTP 모드 진입점
 * 원격 클라이언트 / MCP Inspector에서 사용
 */
import { createMcpServer } from '../core/create-mcp-server'
import { runHttp } from '../transports/streamable-http'
import { config } from '../infra/config'
import { logger } from '../infra/logger'

/**
 * HTTP 모드 실행
 */
async function main() {
    try {
        // MCP 서버 생성
        const server = await createMcpServer()

        // Streamable HTTP 트랜스포트로 연결
        await runHttp(server, config.server.httpPort)

        logger.info(
            {
                port: config.server.httpPort,
                endpoint: '/mcp',
            },
            'MCP Server started in HTTP mode',
        )
    } catch (error) {
        logger.error({ error }, 'Failed to start MCP server in HTTP mode')
        process.exit(1)
    }
}

// 실행
main().catch((error) => {
    logger.error({ error }, 'Unhandled error in HTTP mode')
    process.exit(1)
})
