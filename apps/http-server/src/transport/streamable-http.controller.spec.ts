import type { Request, Response } from 'express'
import type { McpServerFactory } from 'zido/mcp-runtime'
import type { StreamableHttpSessionRegistry } from './streamable-http-session.registry'
import { StreamableHttpController } from './streamable-http.controller'

describe('StreamableHttpController', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('기존 sessionId가 있으면 저장된 transport로 요청을 그대로 전달한다', async () => {
    const handleRequest = jest.fn().mockResolvedValue(undefined)
    const sessionRegistry = {
      get: jest.fn().mockReturnValue({
        transport: { handleRequest },
      }),
      create: jest.fn(),
      delete: jest.fn(),
    }
    const serverFactory = {
      create: jest.fn(),
    }
    const controller = new StreamableHttpController(
      sessionRegistry as unknown as StreamableHttpSessionRegistry,
      serverFactory as unknown as McpServerFactory,
    )
    const request = {
      body: { method: 'notifications/initialized', params: { value: 1 } },
    } as Request
    const response = {} as Response

    await controller.post(request, response, 'session-1')

    expect(sessionRegistry.get).toHaveBeenCalledWith('session-1')
    expect(handleRequest).toHaveBeenCalledWith(request, response, request.body)
    expect(serverFactory.create).not.toHaveBeenCalled()
    expect(sessionRegistry.create).not.toHaveBeenCalled()
  })

  it('initialize 중 server.connect가 실패하면 생성한 session을 정리한다', async () => {
    const deleteSession = jest.fn().mockResolvedValue(true)
    const sessionRegistry = {
      get: jest.fn(),
      create: jest.fn(),
      delete: deleteSession,
    }
    const connectError = new Error('connect failed')
    const server = {
      connect: jest.fn().mockRejectedValue(connectError),
    }
    const serverFactory = {
      create: jest.fn().mockResolvedValue(server),
    }

    const controller = new StreamableHttpController(
      sessionRegistry as unknown as StreamableHttpSessionRegistry,
      serverFactory as unknown as McpServerFactory,
    )
    const request = { body: { method: 'initialize' } } as Request
    const response = {} as Response

    await expect(controller.post(request, response)).rejects.toBe(connectError)

    expect(serverFactory.create).toHaveBeenCalledTimes(1)
    expect(sessionRegistry.create).toHaveBeenCalledTimes(1)
    const sessionId = sessionRegistry.create.mock.calls[0]?.[0]
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(server.connect).toHaveBeenCalledTimes(1)
    expect(server.connect).toHaveBeenCalledWith(sessionRegistry.create.mock.calls[0]?.[2])
    expect(deleteSession).toHaveBeenCalledWith(sessionId)
  })
})
