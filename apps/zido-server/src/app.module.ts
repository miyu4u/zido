import { Module } from '@nestjs/common'
import { MapProvidersModule } from 'zido/map-providers'
import { McpRuntimeModule } from 'zido/mcp-runtime'
import { PlaceDomainModule } from 'zido/place-domain'
import { McpHttpTransportController } from './transport/http-transport.controller'

/**
 * MCP runtime과 장소 domain을 단일 Nest application context에 등록한다.
 */
@Module({
    imports: [MapProvidersModule, PlaceDomainModule, McpRuntimeModule],
    controllers: [McpHttpTransportController],
})
export class AppModule {}
