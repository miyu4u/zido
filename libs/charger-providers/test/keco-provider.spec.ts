import * as fs from 'fs'
import * as path from 'path'
import {
  KecoProvider,
  KecoProviderError,
  buildInfoUrl,
  buildStatusUrl,
  redactExternalUrl,
  redactFullUrlQuery,
  redactSensitiveText,
  stripUrlQuery,
  validateChargerInfoQuery,
  validateChargerStatusQuery,
} from '../src'
import { ChargerTelemetry } from 'zido/common'

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/keco')

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')
}

describe('KecoProvider & Query / Redaction', () => {
  const testServiceKey = 'SUPER_SECRET_KEY_12345'
  const endpoint = 'https://apis.data.go.kr/B552584/EvCharger'

  describe('Query Validation & Bounds', () => {
    describe('validateChargerStatusQuery', () => {
      it('should return default valid values when query is empty', () => {
        const validated = validateChargerStatusQuery()
        expect(validated).toEqual({
          pageNo: 1,
          numOfRows: 9999,
          period: 5,
          zcode: undefined,
        })
      })

      it('should accept valid boundary parameters', () => {
        const validated1 = validateChargerStatusQuery({
          pageNo: 1,
          numOfRows: 10,
          period: 1,
          zcode: '11',
        })
        expect(validated1).toEqual({
          pageNo: 1,
          numOfRows: 10,
          period: 1,
          zcode: '11',
        })

        const validated2 = validateChargerStatusQuery({
          pageNo: 100,
          numOfRows: 9999,
          period: 10,
          zcode: '28',
        })
        expect(validated2).toEqual({
          pageNo: 100,
          numOfRows: 9999,
          period: 10,
          zcode: '28',
        })
      })

      it('should throw INVALID_REQUEST on invalid pageNo (< 1 or float)', () => {
        expect(() => validateChargerStatusQuery({ pageNo: 0 })).toThrow(KecoProviderError)
        expect(() => validateChargerStatusQuery({ pageNo: -5 })).toThrow(KecoProviderError)
        expect(() => validateChargerStatusQuery({ pageNo: 1.5 })).toThrow(KecoProviderError)
      })

      it('should throw INVALID_REQUEST on invalid numOfRows (< 10, > 9999 or float)', () => {
        expect(() => validateChargerStatusQuery({ numOfRows: 9 })).toThrow(KecoProviderError)
        expect(() => validateChargerStatusQuery({ numOfRows: 10000 })).toThrow(KecoProviderError)
        expect(() => validateChargerStatusQuery({ numOfRows: 50.5 })).toThrow(KecoProviderError)
      })

      it('should throw INVALID_REQUEST on invalid period (< 1, > 10 or float)', () => {
        expect(() => validateChargerStatusQuery({ period: 0 })).toThrow(KecoProviderError)
        expect(() => validateChargerStatusQuery({ period: 11 })).toThrow(KecoProviderError)
        expect(() => validateChargerStatusQuery({ period: 5.5 })).toThrow(KecoProviderError)
      })

      it('should throw INVALID_REQUEST on invalid zcode format', () => {
        expect(() => validateChargerStatusQuery({ zcode: '1' })).toThrow(KecoProviderError)
        expect(() => validateChargerStatusQuery({ zcode: '123' })).toThrow(KecoProviderError)
        expect(() => validateChargerStatusQuery({ zcode: 'AB' })).toThrow(KecoProviderError)
      })
    })

    describe('validateChargerInfoQuery', () => {
      it('should return valid defaults when query is undefined', () => {
        const validated = validateChargerInfoQuery()
        expect(validated).toEqual({
          pageNo: 1,
          numOfRows: 9999,
          zcode: undefined,
        })
      })

      it('should accept valid parameters', () => {
        const validated = validateChargerInfoQuery({
          pageNo: 5,
          numOfRows: 500,
          zcode: '41',
        })
        expect(validated).toEqual({
          pageNo: 5,
          numOfRows: 500,
          zcode: '41',
        })
      })

      it('should throw INVALID_REQUEST on invalid bounds', () => {
        expect(() => validateChargerInfoQuery({ pageNo: 0 })).toThrow(KecoProviderError)
        expect(() => validateChargerInfoQuery({ numOfRows: 5 })).toThrow(KecoProviderError)
        expect(() => validateChargerInfoQuery({ zcode: 'seoul' })).toThrow(KecoProviderError)
      })
    })
  })

  describe('URL Builder and Redaction', () => {
    it('should build status URL with query parameters', () => {
      const validated = validateChargerStatusQuery({
        pageNo: 2,
        numOfRows: 100,
        period: 5,
        zcode: '11',
      })
      const url = buildStatusUrl(endpoint, testServiceKey, validated)
      expect(url).toContain('https://apis.data.go.kr/B552584/EvCharger/getChargerStatus?')
      expect(url).toContain(`serviceKey=${testServiceKey}`)
      expect(url).toContain('pageNo=2')
      expect(url).toContain('numOfRows=100')
      expect(url).toContain('period=5')
      expect(url).toContain('zcode=11')
    })

    it('should build info URL with query parameters', () => {
      const validated = validateChargerInfoQuery({
        pageNo: 1,
        numOfRows: 50,
        zcode: '28',
      })
      const url = buildInfoUrl(endpoint, testServiceKey, validated)
      expect(url).toContain('https://apis.data.go.kr/B552584/EvCharger/getChargerInfo?')
      expect(url).toContain(`serviceKey=${testServiceKey}`)
      expect(url).toContain('pageNo=1')
      expect(url).toContain('numOfRows=50')
      expect(url).toContain('zcode=28')
    })

    it('redactExternalUrl should remove the complete external query string', () => {
      const url = `${endpoint}/getChargerStatus?serviceKey=VERY_SECRET_KEY_123&pageNo=1`
      const redacted = redactExternalUrl(url)
      expect(redacted).toBe(`${endpoint}/getChargerStatus`)
      expect(redacted).not.toContain('VERY_SECRET_KEY_123')
      expect(redacted).not.toContain('pageNo')
    })

    it('redactSensitiveText should remove external query strings from errors', () => {
      const message = `Fetch failed for url: ${endpoint}/getChargerInfo?serviceKey=MY_KEY_XYZ&pageNo=1`
      const sanitized = redactSensitiveText(message)
      expect(sanitized).toBe(`Fetch failed for url: ${endpoint}/getChargerInfo`)
      expect(sanitized).not.toContain('MY_KEY_XYZ')
      expect(sanitized).not.toContain('pageNo')
    })

    it('stripUrlQuery and redactFullUrlQuery should completely remove query strings from URLs', () => {
      const url = `${endpoint}/getChargerStatus?serviceKey=VERY_SECRET_123&pageNo=2&numOfRows=100&zcode=11`
      expect(stripUrlQuery(url)).toBe(`${endpoint}/getChargerStatus`)
      expect(redactFullUrlQuery(url)).toBe(`${endpoint}/getChargerStatus`)
    })

    it('redactSensitiveText with stripQueries should remove full query string while preserving path', () => {
      const message = `Network failed when requesting ${endpoint}/getChargerInfo?serviceKey=SECRET&pageNo=1&zcode=11`
      const sanitized = redactSensitiveText(message, { stripQueries: true })
      expect(sanitized).toBe(`Network failed when requesting ${endpoint}/getChargerInfo`)
      expect(sanitized).not.toContain('SECRET')
      expect(sanitized).not.toContain('pageNo')
    })
  })

  describe('KecoProvider Transport & Injected Fetch', () => {
    describe('HTTPS and Endpoint Security', () => {
      it('should throw INVALID_REQUEST on remote http endpoint without explicit allow flag', () => {
        expect(
          () =>
            new KecoProvider({
              serviceKey: 'TEST_KEY',
              endpoint: 'http://apis.data.go.kr/B552584/EvCharger',
            }),
        ).toThrow(KecoProviderError)
      })

      it('should reject remote http endpoints even when an allow flag is supplied', () => {
        const mockFetch: typeof globalThis.fetch = async () => {
          return new Response(readFixture('status-empty.xml'), { status: 200 })
        }
        expect(
          () =>
            new KecoProvider({
              serviceKey: 'TEST_KEY',
              endpoint: 'http://custom-test-host/EvCharger',
              allowInsecureHttp: true,
              fetch: mockFetch,
            }),
        ).toThrow(KecoProviderError)
      })

      it('should allow http localhost/127.0.0.1 for local test adapters with injected fetch', () => {
        const mockFetch: typeof globalThis.fetch = async () => {
          return new Response(readFixture('status-empty.xml'), { status: 200 })
        }
        const provider = new KecoProvider({
          serviceKey: 'TEST_KEY',
          endpoint: 'http://localhost:3000/EvCharger',
          fetch: mockFetch,
          allowInsecureHttp: true,
        })
        expect(provider).toBeInstanceOf(KecoProvider)
      })
    })

    it('should throw AUTHENTICATION when serviceKey is missing in constructor', () => {
      expect(() => new KecoProvider({ serviceKey: '' })).toThrow(KecoProviderError)
      try {
        new KecoProvider({ serviceKey: '   ' })
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.failureKind).toBe('AUTHENTICATION')
        expect(error.retryable).toBe(false)
      }
    })

    it('fetchStatusPage: should call injected fetch and return parsed page', async () => {
      const mockXml = readFixture('status-success.xml')
      const mockFetch: typeof globalThis.fetch = async (input, init) => {
        expect(String(input)).toContain('getChargerStatus')
        expect(String(input)).toContain('serviceKey=TEST_KEY')
        return new Response(mockXml, {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      const provider = new KecoProvider({
        serviceKey: 'TEST_KEY',
        fetch: mockFetch,
      })

      const result = await provider.fetchStatusPage({ pageNo: 1, numOfRows: 9999, period: 5 })
      expect(result.resultCode).toBe('00')
      expect(result.totalCount).toBe(2)
      expect(result.items).toHaveLength(2)
      expect(result.items[0].statId).toBe('28260005')
    })

    it('fetchStatusPage: should handle NO_DATA (03) as successful empty page', async () => {
      const mockXml = readFixture('status-nodata.xml')
      const telemetry = new ChargerTelemetry()
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response(mockXml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      const provider = new KecoProvider({
        serviceKey: 'TEST_KEY',
        fetch: mockFetch,
        telemetry,
      })

      const result = await provider.fetchStatusPage()
      expect(result.resultCode).toBe('03')
      expect(result.totalCount).toBe(0)
      expect(result.items).toEqual([])

      const events = telemetry.snapshot()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        provider: 'keco',
        endpoint: '/getChargerStatus',
        resultCode: '03',
        httpStatus: 200,
        itemCount: 0,
        quotaState: 'OK',
      })
    })

    it('fetchInfoPage: should call injected fetch and return parsed page', async () => {
      const mockXml = readFixture('info-success.xml')
      const mockFetch: typeof globalThis.fetch = async (input) => {
        expect(String(input)).toContain('getChargerInfo')
        return new Response(mockXml, {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      const provider = new KecoProvider({
        serviceKey: 'TEST_KEY',
        fetch: mockFetch,
      })

      const result = await provider.fetchInfoPage({ pageNo: 1, numOfRows: 9999 })
      expect(result.resultCode).toBe('00')
      expect(result.items).toHaveLength(1)
      expect(result.items[0].statNm).toBe('환경부 종합청사 충전소')
    })

    it('should map timeout / AbortError to TIMEOUT (retryable: true)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        const err = new Error('The operation was aborted due to timeout')
        err.name = 'TimeoutError'
        throw err
      }

      const provider = new KecoProvider({
        serviceKey: 'TEST_KEY',
        fetch: mockFetch,
      })

      await expect(provider.fetchStatusPage()).rejects.toMatchObject({
        failureKind: 'TIMEOUT',
        retryable: true,
      })
    })

    it('should map HTTP 429 to RATE_LIMITED (retryable: true)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Too Many Requests', { status: 429, statusText: 'Too Many Requests' })
      }

      const provider = new KecoProvider({
        serviceKey: 'TEST_KEY',
        fetch: mockFetch,
      })

      await expect(provider.fetchStatusPage()).rejects.toMatchObject({
        failureKind: 'RATE_LIMITED',
        retryable: true,
        statusCode: 429,
      })
    })

    it('should map HTTP 401/403 to AUTHENTICATION (retryable: false)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
      }

      const provider = new KecoProvider({
        serviceKey: 'TEST_KEY',
        fetch: mockFetch,
      })

      await expect(provider.fetchStatusPage()).rejects.toMatchObject({
        failureKind: 'AUTHENTICATION',
        retryable: false,
        statusCode: 401,
      })
    })

    it('should map HTTP 404 to CONTRACT_CHANGED (retryable: false)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' })
      }

      const provider = new KecoProvider({
        serviceKey: 'TEST_KEY',
        fetch: mockFetch,
      })

      await expect(provider.fetchStatusPage()).rejects.toMatchObject({
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
        statusCode: 404,
      })
    })

    it('should map HTTP 500/503 to UPSTREAM_UNAVAILABLE (retryable: true)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' })
      }

      const provider = new KecoProvider({
        serviceKey: 'TEST_KEY',
        fetch: mockFetch,
      })

      await expect(provider.fetchStatusPage()).rejects.toMatchObject({
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        statusCode: 503,
      })
    })

    it('should map HTTP 504 to TIMEOUT (retryable: true)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Gateway Timeout', { status: 504, statusText: 'Gateway Timeout' })
      }

      const provider = new KecoProvider({
        serviceKey: 'TEST_KEY',
        fetch: mockFetch,
      })

      await expect(provider.fetchStatusPage()).rejects.toMatchObject({
        failureKind: 'TIMEOUT',
        retryable: true,
        statusCode: 504,
      })
    })

    it('should never leak serviceKey in error messages', async () => {
      const secret = 'SUPER_SECRET_KEY_9999'
      const mockFetch: typeof globalThis.fetch = async (url) => {
        throw new Error(`Connection failed when calling ${url}`)
      }

      const provider = new KecoProvider({
        serviceKey: secret,
        fetch: mockFetch,
      })

      try {
        await provider.fetchStatusPage()
        fail('Expected fetchStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.message).not.toContain(secret)
        expect(error.message).not.toContain('pageNo')
        expect(error.message).toContain('/getChargerStatus')
      }
    })

    describe('Telemetry Integration & Quota Bounds', () => {
      it('records telemetry on error with quota state and httpStatus without leaking raw URLs', async () => {
        const telemetry = new ChargerTelemetry()
        const mockFetch: typeof globalThis.fetch = async () => {
          return new Response('Rate limited', { status: 429, statusText: 'Too Many Requests' })
        }

        const provider = new KecoProvider({
          serviceKey: 'TEST_KEY',
          fetch: mockFetch,
          telemetry,
        })

        await expect(provider.fetchStatusPage()).rejects.toThrow(KecoProviderError)
        const events = telemetry.snapshot()
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
          provider: 'keco',
          endpoint: '/getChargerStatus',
          httpStatus: 429,
          quotaState: 'RATE_LIMITED',
        })
        expect(JSON.stringify(events[0])).not.toContain('TEST_KEY')
      })

      it('enforces bounded telemetry event retention', () => {
        const boundedTelemetry = new ChargerTelemetry(3)
        for (let i = 1; i <= 5; i++) {
          boundedTelemetry.record({
            provider: 'keco',
            endpoint: `/getChargerStatus?i=${i}`,
            resultCode: '00',
            latencyMs: i * 10,
          })
        }

        const events = boundedTelemetry.snapshot()
        expect(events).toHaveLength(3)
        expect(events[0].latencyMs).toBe(30)
        expect(events[1].latencyMs).toBe(40)
        expect(events[2].latencyMs).toBe(50)
        expect(events[0].endpoint).toBe('/getChargerStatus')
      })
    })
  })
})
