import { Module } from '@nestjs/common'
import { ChargerDomainModule } from 'zido/charger-domain'
import { PlaceDomainModule } from 'zido/place-domain'
import { McpServerFactory } from './mcp-server-factory.service'
import { McpToolRegistrarService } from './register-tools'

@Module({
  imports: [PlaceDomainModule, ChargerDomainModule],
  providers: [McpServerFactory, McpToolRegistrarService],
  exports: [McpServerFactory],
})
export class McpRuntimeModule {}
