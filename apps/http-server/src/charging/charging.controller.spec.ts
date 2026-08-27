import type { Response } from 'express'
import { McpException } from 'zido/common'
import { ChargingController } from './charging.controller'

function responseDouble() {
  const headers = new Map<string, string>()
  return {
    headers,
    setHeader: jest.fn((name: string, value: string) => headers.set(name, value)),
    status: jest.fn(),
  } as unknown as Response & { headers: Map<string, string> }
}

describe('ChargingController', () => {
  it('validates the location query before calling the domain service', async () => {
    const service = { searchNearby: jest.fn() }
    const controller = new ChargingController(service as never)
    const response = responseDouble()

    await controller.search({ lat: 'not-a-number', lng: '126.9' }, undefined, response)

    expect(service.searchNearby).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(400)
  })

  it('repeated query parameter array를 INTERNAL_ERROR가 아닌 INVALID_ARGUMENT 400으로 거부한다', async () => {
    const service = { searchNearby: jest.fn() }
    const controller = new ChargingController(service as never)
    const response = responseDouble()

    const result = await controller.search(
      {
        lat: '37.5665',
        lng: '126.978',
        scopeMode: ['regions', 'auto'],
      } as never,
      undefined,
      response,
    )

    expect(service.searchNearby).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(400)
    expect(result).toMatchObject({ error: { code: 'INVALID_ARGUMENT' } })
  })

  it('returns the stable success envelope and cache headers', async () => {
    const service = {
      searchNearby: jest.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
        matchedCount: 0,
        dataAsOf: '2026-08-14T00:00:00.000Z',
        sourceSummary: [],
        scope: {
          mode: 'REGIONS',
          coverage: 'PARTIAL',
          regionCodes: ['11'],
          scopeSource: 'REGIONS',
          collectionTriggered: false,
          provenance: { version: 'test', source: 'fixture', effectiveDate: '2026-08-01' },
        },
      }),
    }
    const controller = new ChargingController(service as never)
    const response = responseDouble()

    const result = await controller.search(
      {
        lat: '37.5665',
        lng: '126.9780',
        radiusM: '3000',
        limit: '20',
        scopeMode: 'regions',
        regionCodes: '11,11',
      },
      'request-1',
      response,
    )

    expect(service.searchNearby).toHaveBeenCalledWith({
      lat: 37.5665,
      lng: 126.978,
      radiusM: 3000,
      limit: 20,
      cursor: undefined,
      status: undefined,
      freshness: undefined,
      source: undefined,
      scope: {
        mode: 'REGIONS',
        regionCodes: ['11', '11'],
        acknowledgeNationwide: undefined,
      },
    })
    expect(result).toMatchObject({
      meta: {
        requestId: 'request-1',
        dataAsOf: '2026-08-14T00:00:00.000Z',
        scope: expect.objectContaining({ coverage: 'PARTIAL', regionCodes: ['11'] }),
      },
      data: { items: [], nextCursor: null, matchedCount: 0 },
    })
    expect(response.headers.get('X-Request-Id')).toBe('request-1')
    expect(response.headers.get('Cache-Control')).toContain('max-age=30')
    expect(response.headers.get('ETag')).toMatch(/^"snapshot-/)
  })

  it('maps cold snapshot failures without exposing provider details', async () => {
    const service = {
      searchNearby: jest.fn().mockRejectedValue(new McpException('secret body', 'SNAPSHOT_UNAVAILABLE', 503)),
    }
    const controller = new ChargingController(service as never)
    const response = responseDouble()

    const result = await controller.search({ lat: '37.5', lng: '126.9' }, undefined, response)

    expect(response.status).toHaveBeenCalledWith(503)
    expect(result).toEqual({
      error: {
        code: 'SNAPSHOT_UNAVAILABLE',
        message: 'Charging snapshot is temporarily unavailable',
        retryable: true,
      },
      meta: expect.objectContaining({ requestId: expect.any(String) }),
    })
    expect(JSON.stringify(result)).not.toContain('secret body')
  })

  it('rejects unsupported sources and malformed cursors as client errors', async () => {
    const service = {
      searchNearby: jest.fn().mockRejectedValue(new McpException('bad cursor', 'INVALID_CURSOR', 400)),
    }
    const controller = new ChargingController(service as never)
    const sourceResponse = responseDouble()
    const cursorResponse = responseDouble()

    await controller.search({ lat: '37.5', lng: '126.9', source: 'other' }, undefined, sourceResponse)
    await controller.search({ lat: '37.5', lng: '126.9', cursor: 'not-a-cursor' }, undefined, cursorResponse)

    expect(service.searchNearby).toHaveBeenCalledTimes(1)
    expect(sourceResponse.status).toHaveBeenCalledWith(400)
    expect(cursorResponse.status).toHaveBeenCalledWith(400)
  })

  it('returns detail data with freshness and maps a missing station to 404', async () => {
    const service = {
      getStatus: jest.fn().mockResolvedValue({
        source: 'keco',
        operatorId: 'ME',
        stationId: '28260005',
        name: '테스트 충전소',
        address: null,
        location: null,
        access: 'PUBLIC',
        sourceObservedAt: '2026-08-14T00:00:00.000Z',
        sourceVersion: 'v1.25',
        chargers: [
          {
            chargerId: '01',
            normalizedStatus: 'AVAILABLE',
            status: 'UNKNOWN',
            freshness: 'STALE',
            rawStatus: '2',
            statusUpdatedAt: '2020-01-01T00:00:00.000Z',
            observedAt: '2020-01-01T00:00:00.000Z',
          },
        ],
      }),
    }
    const controller = new ChargingController(service as never)
    const response = responseDouble()

    const result = await controller.detail('keco%3AME%3A28260005', undefined, 'detail-1', response)

    expect(service.getStatus).toHaveBeenCalledWith('keco:ME:28260005', undefined)
    expect(result).toMatchObject({
      data: { chargers: [{ freshness: 'STALE', status: 'UNKNOWN' }] },
      meta: { requestId: 'detail-1', dataAsOf: '2026-08-14T00:00:00.000Z' },
      sourceSummary: [{ source: 'keco', freshness: 'STALE' }],
    })

    service.getStatus.mockRejectedValueOnce(new McpException('hidden', 'NOT_FOUND', 404))
    const missingResponse = responseDouble()
    const missing = await controller.detail('keco%3AME%3Amissing', undefined, undefined, missingResponse)

    expect(missingResponse.status).toHaveBeenCalledWith(404)
    expect(missing).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'The requested charging station was not found' },
    })
    expect(JSON.stringify(missing)).not.toContain('hidden')
  })

  it('maps provider rate limits to a 429 stable error envelope', async () => {
    const service = {
      searchNearby: jest.fn().mockRejectedValue(new McpException('provider internals', 'RATE_LIMITED', 429)),
    }
    const controller = new ChargingController(service as never)
    const response = responseDouble()

    const result = await controller.search({ lat: '37.5', lng: '126.9' }, undefined, response)

    expect(response.status).toHaveBeenCalledWith(429)
    expect(result).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Charging provider rate limit reached',
        retryable: true,
      },
      meta: expect.objectContaining({ requestId: expect.any(String) }),
    })
    expect(JSON.stringify(result)).not.toContain('provider internals')
  })
})
