import 'reflect-metadata'
import type { INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { KakaoVendor } from 'zido/map-providers'
import type { Place } from 'zido/map-providers'
import { McpServerFactory } from 'zido/mcp-runtime'
import { AppModule } from '../src/app.module'

jest.mock('zido/common', () => {
  /**
   * 실제 common export를 유지한 채 config만 테스트용으로 덮어쓴다.
   */
  const actual = jest.requireActual('zido/common')
  return {
    ...actual,
    config: {
      server: {
        name: 'zido-stdio-test',
        version: '1.0.0-test',
        httpPort: 8000,
        allowedOrigins: ['http://localhost:3000'],
      },
      providers: {
        order: ['kakao'],
        kakao: {
          restKey: 'dummy-kakao-key',
        },
        naver: {
          clientId: '',
          clientSecret: '',
        },
        google: {
          apiKey: '',
        },
      },
    },
  }
})

describe('stdio-server e2e smoke', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('Nest context로 MCP server를 띄우고 place_resolve를 호출한다', async () => {
    /**
     * Kakao resolve가 반환할 고정 Place 결과이다.
     */
    const mockPlace: Place = {
      name: '서울역',
      address: '서울특별시 중구 봉래동2가 122',
      roadAddress: '서울특별시 중구 한강대로 405',
      lat: 37.555,
      lng: 126.971,
      provider: 'kakao',
      raw: { mock: true },
    }

    /**
     * 외부 Kakao API 대신 resolve 경로만 검증하기 위한 spy이다.
     */
    const kakaoResolveSpy = jest.spyOn(KakaoVendor.prototype, 'resolve').mockResolvedValue(mockPlace)

    /**
     * finally에서 종료하기 위해 보관하는 Nest application context이다.
     */
    let context: INestApplicationContext | undefined
    /**
     * finally에서 종료하기 위해 보관하는 MCP server instance이다.
     */
    let server: McpServer | undefined
    /**
     * finally에서 종료하기 위해 보관하는 MCP client instance이다.
     */
    let client: Client | undefined

    try {
      context = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      })

      /**
       * AppModule이 export한 factory로 실제 MCP server를 생성한다.
       */
      const factory = context.get(McpServerFactory)
      server = await factory.create()

      /**
       * 동일 프로세스에서 client/server를 연결하는 in-memory transport 쌍이다.
       */
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

      await server.connect(serverTransport)

      client = new Client({ name: 'smoke', version: '1.0.0' })
      await client.connect(clientTransport)

      /**
       * 등록된 tool 목록에서 place_resolve 존재 여부를 확인한다.
       */
      const listed = await client.listTools()
      /**
       * tools/list 응답에서 추출한 tool name 집합이다.
       */
      const toolNames = listed.tools.map((tool) => tool.name)
      expect(toolNames).toContain('place_resolve')

      /**
       * place_resolve를 서울역 쿼리로 호출한 MCP tool 응답이다.
       */
      const callResult = await client.callTool({
        name: 'place_resolve',
        arguments: { query: '서울역' },
      })

      /**
       * callTool content 중 text payload만 이어 붙인 검증용 문자열이다.
       */
      const responseText = Array.isArray(callResult.content)
        ? callResult.content
            .map((item) =>
              typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string'
                ? item.text
                : '',
            )
            .join('')
        : ''

      expect(responseText).toContain(mockPlace.name)
      expect(kakaoResolveSpy).toHaveBeenCalledWith('서울역')
    } finally {
      await client?.close()
      await server?.close()
      await context?.close()
    }
  })
})
