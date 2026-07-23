import { Module } from '@nestjs/common'
import { McpRuntimeModule } from 'zido/mcp-runtime'

@Module({
    imports: [McpRuntimeModule],
})
export class AppModule {}
