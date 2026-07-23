import { Module } from '@nestjs/common'
import { McpRuntimeModule } from 'zido/mcp-runtime'
import { McpExceptionFilter } from './transport/mcp-exception.filter'
import { StreamableHttpController } from './transport/streamable-http.controller'
import { StreamableHttpSessionRegistry } from './transport/streamable-http-session.registry'

@Module({
    imports: [McpRuntimeModule],
    controllers: [StreamableHttpController],
    providers: [StreamableHttpSessionRegistry, McpExceptionFilter],
})
export class AppModule {}
