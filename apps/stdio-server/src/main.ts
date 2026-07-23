import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { McpServerFactory } from 'zido/mcp-runtime'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
    const context = await NestFactory.createApplicationContext(AppModule, { logger: false })
    const factory = context.get(McpServerFactory)
    const server = await factory.create()
    await server.connect(new StdioServerTransport())
}

void bootstrap().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
})

export default bootstrap
