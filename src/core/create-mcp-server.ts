/**
 * MCP 서버 인스턴스 생성
 * JSON-RPC 2.0 규격을 따르는 MCP 서버를 생성합니다.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { config } from '../infra/config'
import { logger } from '../infra/logger'
import { registerTools } from './register-tools'

/**
 * MCP 서버 생성 및 초기화
 * MCP SDK는 JSON-RPC 2.0 규격을 자동으로 처리합니다.
 * - Request: {"jsonrpc": "2.0", "method": "...", "params": {...}, "id": ...}
 * - Response: {"jsonrpc": "2.0", "result": {...}, "id": ...}
 * - Error: {"jsonrpc": "2.0", "error": {...}, "id": ...}
 */
export async function createMcpServer(): Promise<McpServer> {
    const server = new McpServer(
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
        'MCP Server created (JSON-RPC 2.0 compliant)',
    )

    return server
}
