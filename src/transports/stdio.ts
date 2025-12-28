/**
 * stdio 트랜스포트
 * stdin으로 JSON-RPC를 받고 stdout으로 응답을 내보냄 (로컬 연결용)
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio'
import { logger } from '../infra/logger'

/**
 * stdio 트랜스포트로 서버 연결
 */
export async function runStdio(server: Server): Promise<void> {
    const transport = new StdioServerTransport()

    // 에러 핸들러 설정
    transport.onerror = (error) => {
        logger.error({ error }, 'Stdio transport error')
    }

    // 연결 종료 핸들러 설정
    transport.onclose = () => {
        logger.info('Stdio transport closed')
    }

    // 서버에 트랜스포트 연결
    await server.connect(transport)

    logger.info('Stdio transport connected')
}
