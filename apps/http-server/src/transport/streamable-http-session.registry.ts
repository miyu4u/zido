import { Injectable } from '@nestjs/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { logger, type ID } from 'zido/common'

/**
 * 다른 string 식별자가 session registry key로 섞이지 않도록 구분한다.
 */
export type SessionId = ID<'SessionId'>

/**
 * 한 MCP client에 귀속된 server와 transport의 수명 정보를 보관한다.
 */
export type SessionRecord = {
  /** client 요청을 처리하는 transport instance */
  transport: StreamableHTTPServerTransport
  /** client가 연결된 MCP server instance */
  server: McpServer
  /** session이 registry에 등록된 시각 */
  createdAt: number
  /** 마지막 요청이 registry에 도달한 시각 */
  lastAccessedAt: number
}

/**
 * HTTP boundary가 session을 생성하고 조회하고 종료하기 위한 contract를 정의한다.
 */
export interface StreamableHttpSessionRegistryInterface {
  /**
   * 새 session의 transport와 server를 registry에 등록한다.
   */
  create(sessionId: SessionId, server: McpServer, transport: StreamableHTTPServerTransport): void

  /**
   * 유효한 session을 조회하고 idle timeout을 갱신한다.
   */
  get(sessionId: SessionId): SessionRecord | undefined

  /**
   * session을 제거하고 연결된 transport를 닫는다.
   */
  delete(sessionId: SessionId): Promise<boolean>
}

/**
 * process-local stateful HTTP session을 관리한다.
 */
@Injectable()
export class StreamableHttpSessionRegistry implements StreamableHttpSessionRegistryInterface {
  /** session ID와 MCP connection을 process-local memory에 보관한다. */
  private readonly sessions = new Map<SessionId, SessionRecord>()
  /** 장시간 유휴 상태로 남은 연결을 정리하는 기준 시간이다. */
  private readonly maxAgeMs = 15 * 60 * 1000

  /**
   * server와 transport를 연결하고 transport 종료 시 registry에서도 제거한다.
   */
  create(sessionId: SessionId, server: McpServer, transport: StreamableHTTPServerTransport): void {
    const now = Date.now()
    this.sessions.set(sessionId, {
      transport,
      server,
      createdAt: now,
      lastAccessedAt: now,
    })
    transport.onclose = () => this.delete(sessionId)
    transport.onerror = (error) => logger.error({ error, sessionId }, 'Streamable HTTP transport error')
  }

  /**
   * 만료된 session을 제외하고 접근 시각을 갱신한 record를 반환한다.
   */
  get(sessionId: SessionId): SessionRecord | undefined {
    const session = this.sessions.get(sessionId)
    if (!session) return undefined
    const now = Date.now()
    if (now - session.lastAccessedAt > this.maxAgeMs) {
      void this.delete(sessionId)
      return undefined
    }
    session.lastAccessedAt = now
    return session
  }

  /**
   * registry에서 먼저 제거한 뒤 transport close를 호출해 재진입을 막는다.
   */
  async delete(sessionId: SessionId): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    this.sessions.delete(sessionId)
    await session.transport.close()
    return true
  }
}
