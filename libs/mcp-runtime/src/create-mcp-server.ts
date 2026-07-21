import { Inject, Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { config, logger } from 'zido/configuration'
import { McpToolRegistrarService } from './register-tools'

/**
 * 현재 configuration으로 MCP SDK server를 생성하고 tool registrar를 연결한다.
 */
@Injectable()
export class McpServerFactory {
    @Inject(McpToolRegistrarService)
    private readonly registrar!: McpToolRegistrarService

    /** MCP capabilities와 public tool contract를 초기화한 server를 반환한다. */
    async create(): Promise<McpServer> {
        const server = new McpServer(
            {
                name: config.server.name,
                version: config.server.version,
            },
            { capabilities: { tools: {} } },
        )
        await this.registrar.registerTools(server)
        logger.info(
            { name: config.server.name, version: config.server.version },
            'MCP Server created (JSON-RPC 2.0 compliant)',
        )
        return server
    }
}
