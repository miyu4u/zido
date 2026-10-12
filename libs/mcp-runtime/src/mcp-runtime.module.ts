import { Module } from '@nestjs/common'
import { PlaceDomainModule } from 'zido/place-domain'
import { McpServerFactory } from './mcp-server-factory.service'
import { McpToolRegistrarService } from './mcp-tool-registrar.service'

@Module({
  imports: [PlaceDomainModule],
  providers: [McpServerFactory, McpToolRegistrarService],
  exports: [McpServerFactory],
})
export class McpRuntimeModule {}
