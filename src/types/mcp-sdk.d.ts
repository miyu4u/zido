/**
 * MCP SDK 타입 선언
 * 복잡한 제네릭 타입으로 인한 성능 문제를 방지하기 위해 간소화된 타입 정의
 */

declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export class McpServer {
    constructor(info: any, options?: any)
    registerTool(name: string, schema: any, handler: (args: any) => any): void
    connect(transport: any): Promise<void>
  }
}

declare module '@modelcontextprotocol/sdk/server/streamableHttp.js' {
  export class StreamableHTTPServerTransport {
    constructor(options?: any)
    onerror?: ((error: any) => void) | null
    onclose?: (() => void) | null
    handleRequest(req: any, res: any, body: any): Promise<void>
  }
}
