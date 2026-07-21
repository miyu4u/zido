import { Module } from '@nestjs/common'
import { PlaceDomainModule } from 'zido/place-domain'
import { McpServerFactory } from './create-mcp-server'
import { McpToolRegistrarService } from './register-tools'

/**
 * MCP SDK server factory와 tool registrar의 의존성을 제공한다.
 */
@Module({
    imports: [PlaceDomainModule],
    providers: [McpServerFactory, McpToolRegistrarService],
    exports: [McpServerFactory],
})
export class McpRuntimeModule {}
