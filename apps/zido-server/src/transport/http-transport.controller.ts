import { Controller, Delete, Get, Inject, OnModuleInit, Post, Req, Res } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServerFactory } from 'zido/mcp-runtime'
import { logger } from 'zido/configuration'

/**
 * 하나의 Streamable HTTP transport를 `/mcp`의 기존 method contract에 연결한다.
 */
@Controller('mcp')
export class McpHttpTransportController implements OnModuleInit {
    private transport!: StreamableHTTPServerTransport

    @Inject(McpServerFactory)
    private readonly serverFactory!: McpServerFactory

    /** Nest module 초기화 뒤 MCP server와 HTTP transport를 연결한다. */
    async onModuleInit(): Promise<void> {
        const server = await this.serverFactory.create()
        this.transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
        this.transport.onerror = (error) => logger.error({ error }, 'Streamable HTTP transport error')
        this.transport.onclose = () => logger.info('Streamable HTTP transport closed')
        await server.connect(this.transport)
    }

    /** JSON-RPC POST 요청을 SDK transport로 전달한다. */
    @Post()
    async post(@Req() request: Request, @Res() response: Response): Promise<void> {
        await this.handle(request, response, request.body)
    }

    /** SSE GET 요청을 SDK transport로 전달한다. */
    @Get()
    async get(@Req() request: Request, @Res() response: Response): Promise<void> {
        await this.handle(request, response, {})
    }

    /** 기존 세션 종료 응답을 유지한다. */
    @Delete()
    delete(@Res() response: Response): void {
        response.status(200).json({ message: 'Session closed' })
    }

    /** transport 오류를 HTTP 500 응답으로 변환한다. */
    private async handle(request: Request, response: Response, body: unknown): Promise<void> {
        try {
            await this.transport.handleRequest(request, response, body)
        } catch (error) {
            logger.error({ error }, 'Error handling /mcp')
            if (!response.headersSent) response.status(500).json({ error: 'Internal server error' })
        }
    }
}
