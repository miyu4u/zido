import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
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

        await (transport as { onclose?: () => Promise<unknown> }).onclose?.()

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
})
