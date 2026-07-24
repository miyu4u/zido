import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Injectable } from '@nestjs/common'
import { config, logger } from 'zido/common'
import { McpToolRegistrarService } from './register-tools'

export interface McpServerFactoryInterface {
  /**
   * 공통 server metadata를 적용하고 모든 MCP tool 등록이 끝난 instance를 제공합니다.
   */
  create(): Promise<McpServer>
}

@Injectable()
export class McpServerFactory implements McpServerFactoryInterface {
  constructor(private readonly registrar: McpToolRegistrarService) {}

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
