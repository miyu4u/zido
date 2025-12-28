/**
 * stdio 모드 진입점
 * Claude Desktop 등 로컬 호스트에서 사용
 */
import { createMcpServer } from '../core/create-mcp-server'
import { runStdio } from '../transports/stdio'
import { logger } from '../infra/logger'

/**
 * stdio 모드 실행
 */
async function main() {
    try {
        // MCP 서버 생성
        const server = await createMcpServer()

        // stdio 트랜스포트로 연결
        await runStdio(server)

        logger.info('MCP Server started in stdio mode')
    } catch (error) {
        logger.error({ error }, 'Failed to start MCP server in stdio mode')
        process.exit(1)
    }
}

// 실행
main().catch((error) => {
    logger.error({ error }, 'Unhandled error in stdio mode')
    process.exit(1)
})
