import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import express from 'express'
import request from 'supertest'
import { KakaoVendor, type Place } from 'zido/map-providers'
import { AppModule } from '../src/app.module'
import { McpExceptionFilter } from '../src/transport/mcp-exception.filter'

jest.mock('zido/common', () => {
  /**
   * 원본 common export를 유지한 채 HTTP e2e에 필요한 config만 고정한다.
   */
  const actual = jest.requireActual('zido/common')
  return {
    ...actual,
    config: {
      server: {
        name: 'zido-http-test',
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

/**
 * Streamable HTTP POST가 요구하는 Accept 헤더 조합이다.
 */
const MCP_ACCEPT = 'application/json, text/event-stream'

/**
 * 클라이언트와 서버가 협상하는 MCP protocol version이다.
 */
const MCP_PROTOCOL_VERSION = '2025-03-26'

/**
 * Kakao resolve stub이 반환할 단일 Place payload이다.
 */
const MOCK_PLACE: Place = {
  name: '서울역',
  address: '서울특별시 중구 봉래동2가 122',
  roadAddress: '서울특별시 중구 한강대로 405',
  lat: 37.555,
  lng: 126.971,
  provider: 'kakao',
  raw: { mock: true },
}

/**
 * initialize handshake용 JSON-RPC 요청 body를 만든다.
 */
function createInitializeBody() {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'zido-http-e2e',
        version: '1.0.0-test',
      },
    },
  }
}

/**
 * 세션 handshake 완료를 알리는 notifications/initialized payload를 만든다.
 */
function createInitializedNotificationBody() {
  return {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }
}

/**
 * place_resolve tool 호출용 JSON-RPC 요청 body를 만든다.
 */
function createPlaceResolveBody(query: string) {
  return {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'place_resolve',
      arguments: {
        query,
      },
    },
  }
}

/**
 * supertest 응답에서 JSON body와 text stream을 합쳐 검색 가능한 문자열로 만든다.
 */
function responsePayload(response: request.Response): string {
  const bodyText =
    response.body === undefined || response.body === null || Object.keys(response.body as object).length === 0
      ? ''
      : JSON.stringify(response.body)
  return `${bodyText}${response.text ?? ''}`
}

describe('HTTP Server E2E', () => {
  /**
   * Nest HTTP application instance이다.
   */
  let app: INestApplication

  /**
   * KakaoVendor.resolve 호출을 가로채는 spy이다.
   */
  let kakaoResolveSpy: jest.SpyInstance

  beforeAll(async () => {
    /**
     * 실제 AppModule로 Nest testing application을 구성한다.
     */
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication({ bodyParser: false })
    app.useGlobalFilters(app.get(McpExceptionFilter))
    app.use(express.json({ limit: '1mb' }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('initialize 후 place_resolve tools/call이 Kakao resolve를 호출하고 장소 결과를 반환한다', async () => {
    kakaoResolveSpy = jest.spyOn(KakaoVendor.prototype, 'resolve').mockResolvedValue(MOCK_PLACE)

    /**
     * MCP session을 여는 initialize 응답이다.
     */
    const initializeResponse = await request(app.getHttpServer())
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('MCP-Protocol-Version', MCP_PROTOCOL_VERSION)
      .set('Content-Type', 'application/json')
      .send(createInitializeBody())
      .expect(200)

    /**
     * initialize 응답 헤더에서 추출한 session 식별자이다.
     */
    const sessionId = initializeResponse.headers['mcp-session-id']
    expect(sessionId).toBeDefined()
    expect(typeof sessionId).toBe('string')

    await request(app.getHttpServer())
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('MCP-Protocol-Version', MCP_PROTOCOL_VERSION)
      .set('MCP-Session-Id', sessionId)
      .set('Content-Type', 'application/json')
      .send(createInitializedNotificationBody())

    /**
     * place_resolve tool 호출 응답이다.
     */
    const toolResponse = await request(app.getHttpServer())
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('MCP-Protocol-Version', MCP_PROTOCOL_VERSION)
      .set('MCP-Session-Id', sessionId)
      .set('Content-Type', 'application/json')
      .send(createPlaceResolveBody('서울역'))
      .expect(200)

    expect(responsePayload(toolResponse)).toContain(MOCK_PLACE.name)
    expect(kakaoResolveSpy).toHaveBeenCalledWith('서울역')

    await request(app.getHttpServer()).delete('/mcp').set('MCP-Session-Id', sessionId).expect(204)
  })
})
