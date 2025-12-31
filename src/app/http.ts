/**
 * HTTP 모드 진입점
 * 원격 클라이언트 / MCP Inspector에서 사용
 */
import { randomUUID } from 'node:crypto'
import cors from 'cors'
import express, { type Express } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from '../core/create-mcp-server'
import { config } from '../infra/config'
import { logger } from '../infra/logger'

/**
 * Streamable HTTP 트랜스포트로 서버 연결
 */
export async function runHttp(server: McpServer, port: number): Promise<void> {
    const app: Express = express()

    // 보안 헤더 설정
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
    }))

    // CORS 설정
    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }))

    // Rate Limiting 설정
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15분
        max: 100, // 최대 100개 요청
        message: {
            error: 'Too many requests',
            retryAfter: '15 minutes'
        },
        standardHeaders: true,
        legacyHeaders: false,
    })
    app.use('/mcp', limiter)

    // JSON body 파싱 미들웨어
    app.use(express.json({ limit: '1mb' }))

    // Streamable HTTP 트랜스포트 생성
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
    })

    // 에러 핸들러 설정
    transport.onerror = (error) => {
        logger.error({ error }, 'Streamable HTTP transport error')
    }

    // 연결 종료 핸들러 설정
    if (transport.onclose) {
        transport.onclose = () => {
            logger.info('Streamable HTTP transport closed')
        }
    }

    // POST /mcp - 클라이언트 요청 수신
    app.post('/mcp', async (req, res) => {
        try {
            await transport.handleRequest(req, res, req.body)
        } catch (error) {
            logger.error({ error }, 'Error handling POST /mcp')
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' })
            }
        }
    })

    // GET /mcp - SSE 스트리밍 연결
    app.get('/mcp', async (req, res) => {
        try {
            await transport.handleRequest(req, res, {})
        } catch (error) {
            logger.error({ error }, 'Error handling GET /mcp')
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' })
            }
        }
    })

    // DELETE /mcp - 세션 종료 (선택)
    app.delete('/mcp', async (_req, res) => {
        try {
            // 세션 종료는 transport.close()로 처리
            res.status(200).json({ message: 'Session closed' })
        } catch (error) {
            logger.error({ error }, 'Error handling DELETE /mcp')
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' })
            }
        }
    })

    // 서버에 트랜스포트 연결
    await server.connect(transport)

    // HTTP 서버 시작
    app.listen(port, () => {
        logger.info({ port }, 'Streamable HTTP server started')
    })
}

/**
 * HTTP 모드 실행
 */
async function main() {
    try {
        // MCP 서버 생성
        const server = await createMcpServer()

        // Streamable HTTP 트랜스포트로 연결
        await runHttp(server, config.server.httpPort)

        logger.info(
            {
                port: config.server.httpPort,
                endpoint: '/mcp',
            },
            'MCP Server started in HTTP mode',
        )
    } catch (error) {
        logger.error({ error }, 'Failed to start MCP server in HTTP mode')
        process.exit(1)
    }
}

// 실행
main().catch((error) => {
    logger.error({ error }, 'Unhandled error in HTTP mode')
    process.exit(1)
})
