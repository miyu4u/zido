/**
 * MCP 서버 인스턴스 생성
 */
import { Server } from '@modelcontextprotocol/sdk/server/index'
import { config } from '../infra/config'
import { logger } from '../infra/logger'
import { registerTools } from './register-tools'

/**
 * MCP 서버 생성 및 초기화
 */
export async function createMcpServer(): Promise<Server> {
    const server = new Server(
        {
            name: config.server.name,
            version: config.server.version,
        },
        {
            capabilities: {
                tools: {},
            },
        },
    )

    // 도구 등록
    await registerTools(server)

    logger.info(
        {
            name: config.server.name,
            version: config.server.version,
        },
        'MCP Server created',
    )

    return server
}
