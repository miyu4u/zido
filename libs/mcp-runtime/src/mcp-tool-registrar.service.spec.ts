import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlaceService } from 'zido/place-domain'
import { McpToolRegistrarService } from './mcp-tool-registrar.service'

/**
 * 실제 MCP server의 등록 성공 및 실패가 기존 Promise contract를 유지하는지 검증한다.
 */
describe('McpToolRegistrarService', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('세 place tool을 호출 즉시 등록하고 완료 Promise를 반환한다', async () => {
    /**
     * 등록 과정에는 domain 호출이 필요하지 않아 dependency 사용 여부도 분리한다.
     */
    const registrar = new McpToolRegistrarService({} as PlaceService)
    /**
     * 실제 SDK instance를 사용해 tool schema wiring을 검증한다.
     */
    const server = new McpServer({ name: 'registrar-test', version: '1.0.0' })
    /**
     * 등록 순서와 tool 이름을 실제 SDK 호출 경계에서 관찰한다.
     */
    const register = jest.spyOn(server, 'registerTool')
    /**
     * 호출 시점과 Promise 완료 시점을 각각 검증한다.
     */
    const result = registrar.registerTools(server)
    expect(register).toHaveBeenCalledTimes(3)
    expect(register).toHaveBeenNthCalledWith(1, 'place_resolve', expect.any(Object), expect.any(Function))
    expect(register).toHaveBeenNthCalledWith(2, 'place_search_nearby', expect.any(Object), expect.any(Function))
    expect(register).toHaveBeenNthCalledWith(3, 'place_geocode', expect.any(Object), expect.any(Function))
    await expect(result).resolves.toBeUndefined()
    await server.close()
  })

  it('동기 등록 실패를 throw 대신 Promise rejection으로 전달한다', async () => {
    /**
     * domain 실행 없이 등록 경계의 오류 전달만 검증한다.
     */
    const registrar = new McpToolRegistrarService({} as PlaceService)
    /**
     * SDK 등록 메소드에서 동기 실패를 재현할 실제 server다.
     */
    const server = new McpServer({ name: 'registrar-test', version: '1.0.0' })
    /**
     * wrapper가 원래 실패 객체를 그대로 전달하는지 확인한다.
     */
    const error = new Error('registration failed')
    jest.spyOn(server, 'registerTool').mockImplementation(() => {
      throw error
    })
    await expect(registrar.registerTools(server)).rejects.toBe(error)
    await server.close()
  })
})
