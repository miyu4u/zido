import { Controller, Delete, Get, Headers, HttpCode, Post, Req, Res } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServerFactory } from 'zido/mcp-runtime'
import { McpException } from 'zido/common'
import { StreamableHttpSessionRegistry, type SessionId } from './streamable-http-session.registry'

/**
 * 요청 body가 MCP initialize handshake인지 확인한다.
 */
function isInitialize(body: unknown): boolean {
    return typeof body === 'object' && body !== null && (body as { method?: unknown }).method === 'initialize'
}

/**
 * MCP session별 transport를 HTTP method contract에 연결한다.
 */
@Controller('mcp')
export class StreamableHttpController {
    /**
     * HTTP request마다 필요한 session과 MCP server factory를 주입한다.
     */
    constructor(
        private readonly sessionRegistry: StreamableHttpSessionRegistry,
        private readonly serverFactory: McpServerFactory,
    ) {}

    /**
     * 기존 session을 전달하거나 initialize handshake로 새 session을 만든다.
     */
    @Post()
    async post(
        @Req() request: Request,
        @Res() response: Response,
        @Headers('mcp-session-id') sessionId?: string,
    ): Promise<void> {
        if (sessionId) {
            const brandedSessionId = sessionId as SessionId
            const session = this.sessionRegistry.get(brandedSessionId)
            if (!session) throw new McpException('Session not found', 'SESSION_NOT_FOUND', 404)
            await session.transport.handleRequest(request, response, request.body)
            return
        }
        if (!isInitialize(request.body)) throw new McpException('Initialize request required', 'INITIALIZE_REQUIRED', 400)
        const server = await this.serverFactory.create()
        const createdSessionId = randomUUID() as SessionId
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => createdSessionId })
        this.sessionRegistry.create(createdSessionId, server, transport)
        try {
            await server.connect(transport)
            await transport.handleRequest(request, response, request.body)
        } catch (error) {
            await this.sessionRegistry.delete(createdSessionId)
            throw error
        }
    }

    /**
     * session이 보유한 transport로 GET stream 요청을 전달한다.
     */
    @Get()
    async get(
        @Req() request: Request,
        @Res() response: Response,
        @Headers('mcp-session-id') sessionId?: string,
    ): Promise<void> {
        if (!sessionId) throw new McpException('Session required', 'SESSION_REQUIRED', 400)
        const brandedSessionId = sessionId as SessionId
        const session = this.sessionRegistry.get(brandedSessionId)
        if (!session) throw new McpException('Session not found', 'SESSION_NOT_FOUND', 404)
        await session.transport.handleRequest(request, response)
    }

    /**
     * MCP client가 명시적으로 요청한 session과 transport를 함께 종료한다.
     */
    @Delete()
    @HttpCode(204)
    async delete(@Headers('mcp-session-id') sessionId?: string): Promise<void> {
        if (!sessionId) throw new McpException('Session required', 'SESSION_REQUIRED', 400)
        const brandedSessionId = sessionId as SessionId
        const removed = await this.sessionRegistry.delete(brandedSessionId)
        if (!removed) throw new McpException('Session not found', 'SESSION_NOT_FOUND', 404)
    }
}
