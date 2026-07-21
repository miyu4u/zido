import 'reflect-metadata'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { NestFactory } from '@nestjs/core'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { config, logger } from 'zido/configuration'
import { McpServerFactory } from 'zido/mcp-runtime'
import { AppModule } from './app.module'
import { McpExceptionFilter } from './transport/mcp-exception.filter'

/**
 * stdio context만 만들고 MCP SDK transport를 stdout 경로에 연결한다.
 */
async function bootstrapStdio(): Promise<void> {
    const context = await NestFactory.createApplicationContext(AppModule, { logger: false })
    const factory = context.get(McpServerFactory)
    const server = await factory.create()
    await server.connect(new StdioServerTransport())
}

/**
 * HTTP Nest application에 보안 middleware와 `/mcp` controller를 연결한다.
 */
async function bootstrapHttp(): Promise<void> {
    const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false })
    app.useGlobalFilters(new McpExceptionFilter())
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                },
            },
        }),
    )
    app.use(
        cors({
            origin: config.server.allowedOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        }),
    )
    app.use(
        '/mcp',
        rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
            message: { error: 'Too many requests', retryAfter: '15 minutes' },
            standardHeaders: true,
            legacyHeaders: false,
        }),
    )
    app.use(express.json({ limit: '1mb' }))
    await app.listen(config.server.httpPort)
    logger.info({ port: config.server.httpPort, endpoint: '/mcp' }, 'MCP Server started in HTTP mode')
}

/** transport 환경변수에 따라 exactly one Nest lifecycle을 시작한다. */
async function bootstrap(): Promise<void> {
    if (config.transport === 'stdio') {
        await bootstrapStdio()
        return
    }
    await bootstrapHttp()
}

void bootstrap().catch((error) => {
    logger.error({ error }, 'Failed to start MCP server')
    process.exitCode = 1
})
