import { Module } from '@nestjs/common'
import { McpRuntimeModule } from 'zido/mcp-runtime'

/**
 * stdio lifecycle에 필요한 MCP runtime만 Nest context에 등록한다.
 */
@Module({
    imports: [McpRuntimeModule],
})
export class AppModule {}
