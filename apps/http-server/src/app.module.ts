import { Module } from '@nestjs/common'
import { ChargerDomainModule } from 'zido/charger-domain'
import { McpRuntimeModule } from 'zido/mcp-runtime'
import { ChargingController } from './charging/charging.controller'
import { McpExceptionFilter } from './transport/mcp-exception.filter'
import { StreamableHttpController } from './transport/streamable-http.controller'
import { StreamableHttpSessionRegistry } from './transport/streamable-http-session.registry'

@Module({
  imports: [McpRuntimeModule, ChargerDomainModule],
  controllers: [StreamableHttpController, ChargingController],
  providers: [StreamableHttpSessionRegistry, McpExceptionFilter],
})
export class AppModule {}
