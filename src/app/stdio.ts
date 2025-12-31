/**
 * stdio 모드 진입점
 * Claude Desktop 등 로컬 호스트에서 사용
 *
 * JSON-RPC 2.0 규격:
 * - Request: {"jsonrpc": "2.0", "method": "...", "params": {...}, "id": ...}
 * - Response: {"jsonrpc": "2.0", "result": {...}, "id": ...}
 * - Error: {"jsonrpc": "2.0", "error": {...}, "id": ...}
 *
 * 주의: stdout은 JSON-RPC 통신 전용이므로, 로그는 stderr로 출력해야 합니다.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from '../core/create-mcp-server'
import { logger } from '../infra/logger'

/**
 * stdio 트랜스포트 실행
 * stdin으로 JSON-RPC 2.0 요청을 받고 stdout으로 JSON-RPC 2.0 응답을 내보냄 (로컬 연결용)
 */
async function runStdio(server: McpServer): Promise<void> {
    const transport = new StdioServerTransport()

    transport.onerror = (error) => {
        logger.error({ error }, 'Stdio transport error')
    }
    
    transport.onclose = () => {
        logger.info('Stdio transport closed')
    }
    
    await server.connect(transport)
    logger.info('Stdio transport connected (JSON-RPC 2.0)')
}

/**
 * stdio 모드 실행
 */
export async function main(): Promise<void> {
    try {
        const server = await createMcpServer()
        await runStdio(server)
        logger.info('MCP Server started in stdio mode')
    } catch (error) {
        logger.error({ error }, 'Failed to start MCP server in stdio mode')
        process.exit(1)
    }
}

// 직접 실행 시에만 메인 함수 호출
if (require.main === module) {
    main().catch((error) => {
        logger.error({ error }, 'Unhandled error in stdio mode')
        process.exit(1)
    })
}
