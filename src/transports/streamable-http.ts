/**
 * Streamable HTTP 트랜스포트
 * HTTP 엔드포인트(POST/GET) + SSE 스트리밍 지원
 */
import { randomUUID } from 'node:crypto'
import express, { type Express } from 'express'
import type { Server } from '@modelcontextprotocol/sdk/server/index'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp'
import { logger } from '../infra/logger'

/**
 * Streamable HTTP 트랜스포트로 서버 연결
 */
export async function runHttp(server: Server, port: number): Promise<void> {
    const app: Express = express()

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
    transport.onclose = () => {
        logger.info('Streamable HTTP transport closed')
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
            await transport.handleRequest(req, res)
        } catch (error) {
            logger.error({ error }, 'Error handling GET /mcp')
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' })
            }
        }
    })

    // DELETE /mcp - 세션 종료 (선택)
    app.delete('/mcp', async (req, res) => {
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
