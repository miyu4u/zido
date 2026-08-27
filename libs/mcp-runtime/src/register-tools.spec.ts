import { McpException } from 'zido/common'
import { McpToolRegistrarService } from './register-tools'

describe('McpToolRegistrarService charger tools', () => {
  it('registers charger tools without changing place tool names', async () => {
    const registrations = new Map<string, (args: never) => Promise<unknown>>()
    const server = {
      registerTool: jest.fn((name: string, _definition: unknown, handler: (args: never) => Promise<unknown>) => {
        registrations.set(name, handler)
      }),
    }
    const placeService = {
      resolve: jest.fn(),
      searchNearby: jest.fn(),
      geocode: jest.fn(),
    }
    const chargerService = {
      searchNearby: jest.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
        matchedCount: 0,
        dataAsOf: null,
        sourceSummary: [],
      }),
      previewScope: jest.fn().mockResolvedValue({
        mode: 'AUTO',
        coverage: 'COMPLETE',
        regionCodes: ['11'],
        scopeSource: 'AUTO',
        collectionTriggered: false,
        provenance: { version: 'test', source: 'fixture', effectiveDate: '2026-08-01' },
      }),
      getStatus: jest.fn().mockResolvedValue({ stationId: 'keco:ME:1', chargers: [] }),
    }
    const registrar = new McpToolRegistrarService(placeService as never, chargerService as never)

    await registrar.registerTools(server as never)

    expect([...registrations.keys()]).toEqual([
      'place_resolve',
      'place_search_nearby',
      'place_geocode',
      'charger_search_nearby',
      'charger_scope_preview',
      'charger_status',
    ])
    await registrations.get('charger_search_nearby')?.({
      lat: 37.5,
      lng: 126.9,
      radiusM: 3000,
    } as never)
    expect(chargerService.searchNearby).toHaveBeenCalledWith({
      lat: 37.5,
      lng: 126.9,
      radiusM: 3000,
    })
    await registrations.get('charger_scope_preview')?.({
      lat: 37.5,
      lng: 126.9,
      radiusM: 3000,
    } as never)
    expect(chargerService.previewScope).toHaveBeenCalledWith({
      lat: 37.5,
      lng: 126.9,
      radiusM: 3000,
    })

    await registrations.get('charger_status')?.({
      stationId: 'keco:ME:1',
      chargerId: '01',
    } as never)
    expect(chargerService.getStatus).toHaveBeenCalledWith('keco:ME:1', '01')
  })

  it('returns a safe isError result for unavailable snapshots', async () => {
    const handlers = new Map<string, (args: never) => Promise<unknown>>()
    const server = {
      registerTool: jest.fn((name: string, _definition: unknown, handler: (args: never) => Promise<unknown>) => {
        handlers.set(name, handler)
      }),
    }
    const chargerService = {
      searchNearby: jest.fn().mockRejectedValue(new McpException('raw key body', 'SNAPSHOT_UNAVAILABLE', 503)),
      getStatus: jest.fn(),
    }
    const registrar = new McpToolRegistrarService({} as never, chargerService as never)
    await registrar.registerTools(server as never)

    const result = (await handlers.get('charger_search_nearby')?.({
      lat: 37.5,
      lng: 126.9,
    } as never)) as { isError: boolean; content: Array<{ text: string }> }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('SNAPSHOT_UNAVAILABLE')
    expect(result.content[0].text).not.toContain('raw key body')
  })

  it('preserves RATE_LIMITED as a stable MCP error without provider details', async () => {
    const handlers = new Map<string, (args: never) => Promise<unknown>>()
    const server = {
      registerTool: jest.fn((name: string, _definition: unknown, handler: (args: never) => Promise<unknown>) => {
        handlers.set(name, handler)
      }),
    }
    const chargerService = {
      searchNearby: jest.fn(),
      getStatus: jest.fn().mockRejectedValue(new McpException('provider quota internals', 'RATE_LIMITED', 429)),
    }
    const registrar = new McpToolRegistrarService({} as never, chargerService as never)
    await registrar.registerTools(server as never)

    const result = (await handlers.get('charger_status')?.({
      stationId: 'keco:ME:1',
    } as never)) as { isError: boolean; content: Array<{ text: string }> }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('RATE_LIMITED')
    expect(result.content[0].text).toContain('Charging provider rate limit reached')
    expect(result.content[0].text).not.toContain('provider quota internals')
  })
})
