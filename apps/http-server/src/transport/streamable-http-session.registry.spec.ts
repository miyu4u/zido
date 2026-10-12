import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { logger } from 'zido/common'
import { StreamableHttpSessionRegistry, type SessionId } from './streamable-http-session.registry'

describe('StreamableHttpSessionRegistry', () => {
  /** test 전반에서 동일한 registry key를 사용한다. */
  const sessionId = 'session-1' as SessionId

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('create와 get은 session을 저장하고 마지막 접근 시간을 갱신하며 onclose로 정리한다', async () => {
    const now = jest.spyOn(Date, 'now')
    const close = jest.fn().mockResolvedValue(undefined)
    const transport = { close } as unknown as StreamableHTTPServerTransport
    const server = {} as McpServer
    const registry = new StreamableHttpSessionRegistry()

    now.mockReturnValue(1_000)
    registry.create(sessionId, server, transport)

    const created = registry.get(sessionId)

    expect(created).toMatchObject({
      server,
      transport,
      createdAt: 1_000,
      lastAccessedAt: 1_000,
    })

    now.mockReturnValueOnce(1_500)
    const refreshed = registry.get(sessionId)

    expect(refreshed).toBe(created)
    expect(refreshed?.lastAccessedAt).toBe(1_500)

    expect(transport.onclose?.()).toBeUndefined()

    expect(registry.get(sessionId)).toBeUndefined()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('만료된 session은 get에서 제거되고 transport.close를 호출한다', () => {
    const now = jest.spyOn(Date, 'now')
    const close = jest.fn().mockResolvedValue(undefined)
    const transport = { close } as unknown as StreamableHTTPServerTransport
    const server = {} as McpServer
    const registry = new StreamableHttpSessionRegistry()

    now.mockReturnValue(1_000)
    registry.create(sessionId, server, transport)

    now.mockReturnValueOnce(1_000 + 15 * 60 * 1000 + 1)
    expect(registry.get(sessionId)).toBeUndefined()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('delete는 existing session을 제거하고 없는 session에는 false를 반환한다', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000)
    const close = jest.fn().mockResolvedValue(undefined)
    const transport = { close } as unknown as StreamableHTTPServerTransport
    const server = {} as McpServer
    const registry = new StreamableHttpSessionRegistry()

    registry.create(sessionId, server, transport)

    await expect(registry.delete(sessionId)).resolves.toBe(true)
    await expect(registry.delete(sessionId)).resolves.toBe(false)
    expect(close).toHaveBeenCalledTimes(1)

    now.mockRestore()
  })

  it.each(['onclose', 'timeout'] as const)('%s 정리 실패는 session을 제거하고 오류를 기록한다', async (trigger) => {
    /**
     * 실제 삭제 경로에서 transport 종료 실패를 재현한다.
     */
    const error = new Error('close failed')
    /**
     * 미처리 rejection 대신 logger 경계로 실패가 전달되는지 관찰한다.
     */
    const logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    /**
     * callback 호출과 만료 경로가 동일한 실패 transport를 사용하도록 구성한다.
     */
    const transport = { close: jest.fn().mockRejectedValue(error) } as unknown as StreamableHTTPServerTransport
    /**
     * session 생성과 만료 판정 시각을 외부 clock과 분리한다.
     */
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000)
    /**
     * production registry를 사용해 정리 및 오류 처리를 함께 검증한다.
     */
    const registry = new StreamableHttpSessionRegistry()
    registry.create(sessionId, {} as McpServer, transport)

    switch (trigger) {
      case 'onclose':
        expect(transport.onclose?.()).toBeUndefined()
        break
      case 'timeout':
        now.mockReturnValue(1_000 + 15 * 60 * 1000 + 1)
        expect(registry.get(sessionId)).toBeUndefined()
        break
    }

    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(registry.get(sessionId)).toBeUndefined()
    expect(logError).toHaveBeenCalledWith({ error, sessionId }, 'Streamable HTTP session close failed')
    expect(transport.close).toHaveBeenCalledTimes(1)
  })
})
