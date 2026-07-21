import 'reflect-metadata'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { NestFactory } from '@nestjs/core'
import type { NextFunction, Request, Response } from 'express'
import { logger, config } from 'zido/configuration'
import { AppModule } from './app.module'
import { McpExceptionFilter } from './transport/mcp-exception.filter'

/**
 * Origin header가 HTTP configuration의 허용 목록에 속하는지 확인한다.
 */
function isAllowedOrigin(origin: string): boolean {
    return config.server.allowedOrigins.includes(origin)
}

/**
 * HTTP transport 하나의 process lifecycle과 보안 경계를 시작한다.
 */
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false })
    app.useGlobalFilters(app.get(McpExceptionFilter))
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
    app.use((request: Request, response: Response, next: NextFunction) => {
        const origin = request.headers.origin
        if (typeof origin === 'string' && !isAllowedOrigin(origin)) {
            response.status(403).json({ statusCode: 403, code: 'FORBIDDEN_ORIGIN', message: 'Origin not allowed' })
            return
        }
        next()
    })
    app.use(
        cors({
            origin: config.server.allowedOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Content-Type',
                'Authorization',
                'MCP-Session-Id',
                'MCP-Protocol-Version',
                'Last-Event-ID',
            ],
            exposedHeaders: ['MCP-Session-Id', 'MCP-Protocol-Version'],
        }),
    )
    app.use(express.json({ limit: '1mb' }))
    app.use(
        '/mcp',
        rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
            standardHeaders: true,
            legacyHeaders: false,
        }),
    )
    app.use('/mcp', (_request: Request, response: Response, next: NextFunction) => {
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        next()
    })
    await app.listen(config.server.httpPort)
    logger.info({ port: config.server.httpPort, endpoint: '/mcp' }, 'MCP HTTP server started')
}

void bootstrap().catch((error) => {
    logger.error({ error }, 'Failed to start MCP HTTP server')
    process.exitCode = 1
})

export default bootstrap
