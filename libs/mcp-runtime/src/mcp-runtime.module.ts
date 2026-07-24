import { Module } from '@nestjs/common'
import { PlaceDomainModule } from 'zido/place-domain'
import { McpServerFactory } from './mcp-server-factory.service'
import { McpToolRegistrarService } from './register-tools'

@Module({
  imports: [PlaceDomainModule],
  providers: [McpServerFactory, McpToolRegistrarService],
  exports: [McpServerFactory],
})
export class McpRuntimeModule {}
