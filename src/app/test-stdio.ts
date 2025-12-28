/**
 * stdio 모드 테스트 스크립트
 * tools/list와 tools/call을 테스트합니다
 */
import { createMcpServer } from '../core/create-mcp-server'
import { logger } from '../infra/logger'
import { runStdio } from '../transports/stdio'

/**
 * JSON-RPC 요청 생성 헬퍼
 */
function createRequest(method: string, params?: unknown, id?: number) {
    return {
        jsonrpc: '2.0',
        id: id ?? Math.floor(Math.random() * 10000),
        method,
        params: params ?? {},
    }
}

/**
 * stdio 모드 테스트
 */
async function testStdio() {
    logger.info('Starting stdio mode test...')

    try {
        // MCP 서버 생성
        const server = await createMcpServer()

        // stdio 트랜스포트로 연결
        await runStdio(server)

        logger.info('Server started. You can now send JSON-RPC messages via stdin.')
        logger.info('Example: tools/list request')

        // 테스트용: tools/list 요청 시뮬레이션
        const listRequest = createRequest('tools/list')
        logger.info({ request: listRequest }, 'Example tools/list request')

        // 테스트용: tools/call 요청 시뮬레이션 (place.resolve)
        const callRequest = createRequest('tools/call', {
            name: 'place.resolve',
            arguments: {
                query: '가산동 주민센터',
            },
        })
        logger.info({ request: callRequest }, 'Example tools/call request (place.resolve)')

        // 테스트용: tools/call 요청 시뮬레이션 (place.searchNearby)
        const searchRequest = createRequest('tools/call', {
            name: 'place.searchNearby',
            arguments: {
                center: { lat: 37.4785, lng: 126.8886 },
                keyword: '사진관',
                radiusM: 1000,
            },
        })
        logger.info({ request: searchRequest }, 'Example tools/call request (place.searchNearby)')

        // 테스트용: tools/call 요청 시뮬레이션 (geo.geocode)
        const geocodeRequest = createRequest('tools/call', {
            name: 'geo.geocode',
            arguments: {
                address: '서울특별시 금천구 가산동',
            },
        })
        logger.info({ request: geocodeRequest }, 'Example tools/call request (geo.geocode)')

        logger.info('\nTo test manually, send JSON-RPC messages to stdin:')
        logger.info('1. tools/list: ' + JSON.stringify(listRequest))
        logger.info('2. place.resolve: ' + JSON.stringify(callRequest))
        logger.info('3. place.searchNearby: ' + JSON.stringify(searchRequest))
        logger.info('4. geo.geocode: ' + JSON.stringify(geocodeRequest))

        // 서버가 계속 실행되도록 유지
        process.stdin.resume()
    } catch (error) {
        logger.error({ error }, 'Test failed')
        process.exit(1)
    }
}

// 실행
testStdio().catch((error) => {
    logger.error({ error }, 'Unhandled error in test')
    process.exit(1)
})
