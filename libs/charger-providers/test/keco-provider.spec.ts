import * as fs from 'fs'
import * as path from 'path'
import { HttpException, HttpStatus } from '@nestjs/common'
import {
  KecoAPIService,
  KecoService,
  KecoProviderError,
  createKecoErrorFromResultCode,
  createKecoHttpError,
  buildInfoUrl,
  buildStatusUrl,
  redactExternalUrl,
  redactFullUrlQuery,
  redactSensitiveText,
  stripUrlQuery,
  validateChargerInfoQuery,
  validateChargerStatusQuery,
  KecoBaseItemSchema,
  KecoStatusItemSchema,
  KecoInfoItemSchema,
  KecoStatusPageSchema,
  KecoInfoPageSchema,
  ChargerStatusQuerySchema,
  ChargerInfoQuerySchema,
  ValidatedStatusQuerySchema,
  ValidatedInfoQuerySchema,
  KecoStatusRequestSchema,
  KecoInfoRequestSchema,
} from '../src'
import { ChargerTelemetry, config } from 'zido/common'

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/keco')

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')
}

describe('KECO Provider Services & Query / Redaction', () => {
  const testServiceKey = 'SUPER_SECRET_KEY_12345'
  const endpoint = 'https://apis.data.go.kr/B552584/EvCharger'

  describe('COV-004: Query Validation Bounds & Defaults', () => {
    describe('validateChargerStatusQuery', () => {
      it('should reject an implicit nationwide query and apply defaults only to explicit nationwide', () => {
        expect(() => validateChargerStatusQuery()).toThrow(KecoProviderError)
        const validated = validateChargerStatusQuery({ nationwide: true })
        expect(validated).toEqual({
          pageNo: 1,
          numOfRows: 9999,
          period: 5,
          nationwide: true,
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
      it('should reject an implicit nationwide query and apply defaults only to explicit nationwide', () => {
        expect(() => validateChargerInfoQuery()).toThrow(KecoProviderError)
        const validated = validateChargerInfoQuery({ nationwide: true })
        expect(validated).toEqual({
          pageNo: 1,
          numOfRows: 9999,
          nationwide: true,
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

  describe('COV-002 & COV-003: Public Zod Schemas Validation', () => {
    describe('KecoBaseItemSchema & KecoStatusItemSchema', () => {
      it('should parse valid status item shape successfully', () => {
        const validItem = {
          busiId: 'ME',
          statId: '28260005',
          chgerId: '01',
          stat: '2',
          statUpdDt: '20190829121020',
        }
        const parsed = KecoStatusItemSchema.parse(validItem)
        expect(parsed).toEqual(validItem)
      })

      it('should allow nullable fields in base/status item', () => {
        const itemWithNulls = {
          busiId: null,
          statId: '28260005',
          chgerId: '01',
          stat: null,
          statUpdDt: null,
        }
        const parsed = KecoStatusItemSchema.parse(itemWithNulls)
        expect(parsed).toEqual(itemWithNulls)
      })

      it('should reject invalid status item shape with missing or non-string fields', () => {
        expect(KecoStatusItemSchema.safeParse({ busiId: 123, statId: '28260005' }).success).toBe(false)
        expect(KecoStatusItemSchema.safeParse({ statId: undefined }).success).toBe(false)
        expect(KecoStatusItemSchema.safeParse('not-an-object').success).toBe(false)
      })
    })

    describe('KecoInfoItemSchema', () => {
      it('should parse valid info item with extended and optional fields', () => {
        const validInfo = {
          busiId: 'ME',
          statId: '28260005',
          chgerId: '01',
          stat: '2',
          statUpdDt: '20190829121020',
          statNm: '환경부 종합청사 충전소',
          chgerType: '01',
          addr: '인천광역시 서구 환경로 42',
          address: '인천광역시 서구 환경로 42',
          detail: '지상 주차장 1열',
          location: '지상 주차장 1열',
          addrDetail: '지상 주차장 1열',
          lat: '37.5665',
          lng: 126.978,
          useTime: '24시간 이용가능',
          busiNm: '환경부',
          busnNm: '환경부',
          busiCall: '1661-9408',
          lastTsdt: '20190829110000',
          lastTedt: '20190829113000',
          nowTsdt: null,
          output: 50,
          method: '단독',
          zcode: '28',
          zscode: '28260',
          kind: 'G0',
          kindDetail: 'G001',
          parkingFree: 'Y',
          note: null,
          limitYn: 'N',
          limitDetail: null,
          delYn: 'N',
          delDetail: null,
          trafficYn: 'N',
          year: '2019',
          floorNum: '1',
          floorType: '지상',
        }
        const parsed = KecoInfoItemSchema.parse(validInfo)
        expect(parsed.statNm).toBe('환경부 종합청사 충전소')
        expect(parsed.output).toBe(50)
        expect(parsed.lng).toBe(126.978)
      })

      it('should reject invalid info item shapes', () => {
        expect(KecoInfoItemSchema.safeParse({ statNm: 12345 }).success).toBe(false)
        expect(KecoInfoItemSchema.safeParse({ lat: {} }).success).toBe(false)
      })
    })

    describe('KecoStatusPageSchema & KecoInfoPageSchema', () => {
      it('should parse valid status page envelope', () => {
        const validPage = {
          resultCode: '00',
          resultMsg: 'OK',
          pageNo: 1,
          numOfRows: 9999,
          totalCount: 1,
          items: [
            {
              busiId: 'ME',
              statId: '28260005',
              chgerId: '01',
              stat: '2',
              statUpdDt: '20190829121020',
            },
          ],
        }
        const parsed = KecoStatusPageSchema.parse(validPage)
        expect(parsed.resultCode).toBe('00')
        expect(parsed.items).toHaveLength(1)
      })

      it('should parse valid info page envelope', () => {
        const validInfoPage = {
          resultCode: '00',
          resultMsg: 'OK',
          pageNo: 1,
          numOfRows: 10,
          totalCount: 0,
          items: [],
        }
        const parsed = KecoInfoPageSchema.parse(validInfoPage)
        expect(parsed.resultCode).toBe('00')
        expect(parsed.items).toEqual([])
      })

      it('should reject invalid page shapes (missing items, non-number pageNo, non-string resultCode)', () => {
        expect(
          KecoStatusPageSchema.safeParse({
            resultCode: '00',
            resultMsg: 'OK',
            pageNo: '1',
            numOfRows: 10,
            totalCount: 0,
            items: [],
          }).success,
        ).toBe(false)
        expect(
          KecoStatusPageSchema.safeParse({
            resultCode: 0,
            resultMsg: 'OK',
            pageNo: 1,
            numOfRows: 10,
            totalCount: 0,
            items: [],
          }).success,
        ).toBe(false)
        expect(
          KecoStatusPageSchema.safeParse({
            resultCode: '00',
            resultMsg: 'OK',
            pageNo: 1,
            numOfRows: 10,
            totalCount: 0,
          }).success,
        ).toBe(false)
      })
    })

    describe('Request and Validated Query Schemas', () => {
      it('should validate and apply defaults with ValidatedStatusQuerySchema and ValidatedInfoQuerySchema', () => {
        const statusValidated = ValidatedStatusQuerySchema.parse({ nationwide: true })
        expect(statusValidated).toEqual({
          pageNo: 1,
          numOfRows: 9999,
          period: 5,
          nationwide: true,
          zcode: undefined,
        })

        const infoValidated = ValidatedInfoQuerySchema.parse({ nationwide: true })
        expect(infoValidated).toEqual({
          pageNo: 1,
          numOfRows: 9999,
          nationwide: true,
          zcode: undefined,
        })
      })

      it('should validate KecoStatusRequestSchema and KecoInfoRequestSchema requiring serviceKey', () => {
        const parsed = KecoStatusRequestSchema.parse({ serviceKey: 'TEST_KEY', nationwide: true })
        expect(parsed.serviceKey).toBe('TEST_KEY')
        expect(parsed.pageNo).toBe(1)
        expect(parsed.period).toBe(5)

        expect(KecoStatusRequestSchema.safeParse({}).success).toBe(false)
        expect(KecoInfoRequestSchema.safeParse({}).success).toBe(false)
      })
    })
  })

  describe('URL Builder and Sensitive Redaction', () => {
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

  describe('COV-006 & COV-007: KecoProviderError Contract, HttpException Inheritance & Redaction', () => {
    it('should inherit from HttpException and preserve status code per failureKind', () => {
      const errorAuth = new KecoProviderError('Auth failed', { failureKind: 'AUTHENTICATION' })
      expect(errorAuth).toBeInstanceOf(HttpException)
      expect(errorAuth.getStatus()).toBe(HttpStatus.UNAUTHORIZED)
      expect(errorAuth.failureKind).toBe('AUTHENTICATION')
      expect(errorAuth.retryable).toBe(false)

      const errorInvalid = new KecoProviderError('Invalid req', { failureKind: 'INVALID_REQUEST' })
      expect(errorInvalid.getStatus()).toBe(HttpStatus.BAD_REQUEST)

      const errorContract = new KecoProviderError('Contract broke', { failureKind: 'CONTRACT_CHANGED' })
      expect(errorContract.getStatus()).toBe(HttpStatus.BAD_GATEWAY)

      const errorTimeout = new KecoProviderError('Timed out', { failureKind: 'TIMEOUT', retryable: true })
      expect(errorTimeout.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT)
      expect(errorTimeout.retryable).toBe(true)

      const errorRate = new KecoProviderError('Rate limited', { failureKind: 'RATE_LIMITED', retryable: true })
      expect(errorRate.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)

      const errorQuota = new KecoProviderError('Quota hit', { failureKind: 'QUOTA_EXHAUSTED' })
      expect(errorQuota.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)

      const errorBlocked = new KecoProviderError('IP blocked', { failureKind: 'BLOCKED_NETWORK' })
      expect(errorBlocked.getStatus()).toBe(HttpStatus.FORBIDDEN)

      const errorUpstream = new KecoProviderError('Upstream down', { failureKind: 'UPSTREAM_UNAVAILABLE', retryable: true })
      expect(errorUpstream.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)

      const errorCustomStatus = new KecoProviderError('Custom status', { failureKind: 'UPSTREAM_UNAVAILABLE', statusCode: 500 })
      expect(errorCustomStatus.getStatus()).toBe(500)
    })

    it('getResponse() should preserve failure metadata without exposing secrets', () => {
      const secret = 'SUPER_SECRET_TOKEN_XYZ_777'
      const cause = new Error(`Socket timeout for ${endpoint}?serviceKey=${secret}`)
      cause.name = `FetchError?serviceKey=${secret}`
      const error = new KecoProviderError(`Error calling url: ${endpoint}/getChargerStatus?serviceKey=${secret}&pageNo=1`, {
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        resultCode: '99',
        statusCode: 503,
        rawResultMsg: `Upstream error with ?serviceKey=${secret}`,
        cause,
      })

      expect(error.getStatus()).toBe(503)
      const response = error.getResponse() as Record<string, unknown>
      expect(response).toMatchObject({
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        resultCode: '99',
        statusCode: 503,
      })

      // Redaction checks on error properties and response
      expect(error.message).not.toContain(secret)
      expect(error.message).not.toContain('pageNo')
      expect(JSON.stringify(response)).not.toContain(secret)
      expect(JSON.stringify(response)).not.toContain('pageNo')
      expect(error.rawResultMsg).not.toContain(secret)
      expect(error.cause).toBeInstanceOf(Error)
      expect((error.cause as Error).message).not.toContain(secret)
      expect((error.cause as Error).name).not.toContain(secret)
      expect((error.cause as Error).toString()).not.toContain(secret)
      expect((error.cause as Error).stack).not.toContain(secret)
    })

    it('createKecoHttpError and createKecoErrorFromResultCode should create typed HttpException instances', () => {
      const http401 = createKecoHttpError(401)
      expect(http401).toBeInstanceOf(HttpException)
      expect(http401.failureKind).toBe('AUTHENTICATION')
      expect(http401.getStatus()).toBe(401)

      const http429 = createKecoHttpError(429)
      expect(http429.failureKind).toBe('RATE_LIMITED')
      expect(http429.retryable).toBe(true)
      expect(http429.getStatus()).toBe(429)

      const code05 = createKecoErrorFromResultCode('05', 'TIMEOUT')
      expect(code05).toBeInstanceOf(HttpException)
      expect(code05.failureKind).toBe('TIMEOUT')
      expect(code05.retryable).toBe(true)
      expect(code05.resultCode).toBe('05')

      const code20 = createKecoErrorFromResultCode('20', 'AUTH_ERROR')
      expect(code20).toBeInstanceOf(HttpException)
      expect(code20.failureKind).toBe('AUTHENTICATION')
      expect(code20.retryable).toBe(false)
    })
  })

  describe('COV-008: KecoAPIService Transport & Injected Fetch Spy', () => {
    describe('HTTPS and Endpoint Security', () => {
      it('should throw INVALID_REQUEST on remote http endpoint without explicit allow flag', () => {
        expect(
          () =>
            new KecoAPIService({
              serviceKey: 'TEST_KEY',
              endpoint: 'http://apis.data.go.kr/B552584/EvCharger',
              timeoutMs: 8000,
            }),
        ).toThrow(KecoProviderError)
      })

      it('should reject remote http endpoints even when an allow flag is supplied', () => {
        const mockFetch: typeof globalThis.fetch = async () => {
          return new Response(readFixture('status-empty.xml'), { status: 200 })
        }
        expect(
          () =>
            new KecoAPIService({
              serviceKey: 'TEST_KEY',
              endpoint: 'http://custom-test-host/EvCharger',
              timeoutMs: 8000,
              allowInsecureHttp: true,
              fetchFn: mockFetch,
            }),
        ).toThrow(KecoProviderError)
      })

      it('should allow http localhost/127.0.0.1 for local test adapters with injected fetch', () => {
        const mockFetch: typeof globalThis.fetch = async () => {
          return new Response(readFixture('status-empty.xml'), { status: 200 })
        }
        const apiService = new KecoAPIService({
          serviceKey: 'TEST_KEY',
          endpoint: 'http://localhost:3000/EvCharger',
          timeoutMs: 8000,
          fetchFn: mockFetch,
          allowInsecureHttp: true,
        })
        expect(apiService).toBeInstanceOf(KecoAPIService)
      })
    })

    it('should throw AUTHENTICATION when serviceKey is missing in constructor', () => {
      expect(() => new KecoAPIService({ serviceKey: '', endpoint, timeoutMs: 8000 })).toThrow(KecoProviderError)
      try {
        new KecoAPIService({ serviceKey: '   ', endpoint, timeoutMs: 8000 })
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.failureKind).toBe('AUTHENTICATION')
        expect(error.retryable).toBe(false)
      }
    })

    it('should assert GET method, endpoint path/query, Accept header, and timeout signal for getChargerStatus', async () => {
      let capturedUrl = ''
      let capturedInit: RequestInit | undefined
      const mockFetch: typeof globalThis.fetch = jest.fn(async (input, init) => {
        capturedUrl = String(input)
        capturedInit = init
        return new Response(readFixture('status-success.xml'), {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      })

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY_123',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })

      await apiService.getChargerStatus({
        pageNo: 2,
        numOfRows: 50,
        period: 7,
        zcode: '11',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(capturedUrl).toContain(`${endpoint}/getChargerStatus?`)
      expect(capturedUrl).toContain('serviceKey=TEST_KEY_123')
      expect(capturedUrl).toContain('pageNo=2')
      expect(capturedUrl).toContain('numOfRows=50')
      expect(capturedUrl).toContain('period=7')
      expect(capturedUrl).toContain('zcode=11')

      expect(capturedInit?.method).toBe('GET')
      expect(capturedInit?.headers).toEqual({
        Accept: 'application/xml, text/xml, */*',
      })
      expect(capturedInit?.signal).toBeInstanceOf(AbortSignal)
      expect(capturedInit?.signal?.aborted).toBe(false)
    })

    it('should assert GET method, endpoint path/query, Accept header, and timeout signal for getChargerInfo', async () => {
      let capturedUrl = ''
      let capturedInit: RequestInit | undefined
      const mockFetch: typeof globalThis.fetch = jest.fn(async (input, init) => {
        capturedUrl = String(input)
        capturedInit = init
        return new Response(readFixture('info-success.xml'), {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      })

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY_123',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })

      await apiService.getChargerInfo({
        pageNo: 3,
        numOfRows: 100,
        zcode: '28',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(capturedUrl).toContain(`${endpoint}/getChargerInfo?`)
      expect(capturedUrl).toContain('serviceKey=TEST_KEY_123')
      expect(capturedUrl).toContain('pageNo=3')
      expect(capturedUrl).toContain('numOfRows=100')
      expect(capturedUrl).toContain('zcode=28')

      expect(capturedInit?.method).toBe('GET')
      expect(capturedInit?.headers).toEqual({
        Accept: 'application/xml, text/xml, */*',
      })
      expect(capturedInit?.signal).toBeInstanceOf(AbortSignal)
      expect(capturedInit?.signal?.aborted).toBe(false)
    })
  })

  describe('COV-009: Transport Failure Mapping & Network Rejection', () => {
    it('should map network rejection to UPSTREAM_UNAVAILABLE (retryable: true) without leaking sentinel in message/response/cause', async () => {
      const sentinel = 'SENTINEL_NETWORK_SECRET_99999'
      const mockFetch: typeof globalThis.fetch = async (url) => {
        const err = new Error(`connect ECONNREFUSED when calling ${url}`)
        err.name = 'FetchError'
        throw err
      }

      const apiService = new KecoAPIService({
        serviceKey: sentinel,
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService)

      try {
        await service.fetchStatusPage({ nationwide: true })
        fail('Expected fetchStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.failureKind).toBe('UPSTREAM_UNAVAILABLE')
        expect(error.retryable).toBe(true)
        expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)

        expect(error.message).not.toContain(sentinel)
        expect(error.message).not.toContain('pageNo')
        expect(JSON.stringify(error.getResponse())).not.toContain(sentinel)
        expect(error.cause).toBeInstanceOf(Error)
        expect((error.cause as Error).message).not.toContain(sentinel)
        expect((error.cause as Error).message).not.toContain('pageNo')
      }
    })

    it('should map timeout / AbortError to TIMEOUT (retryable: true)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        const err = new Error('The operation was aborted due to timeout')
        err.name = 'TimeoutError'
        throw err
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService)

      await expect(service.fetchStatusPage({ nationwide: true })).rejects.toMatchObject({
        failureKind: 'TIMEOUT',
        retryable: true,
      })
    })

    it('should map HTTP 429 to RATE_LIMITED (retryable: true)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Too Many Requests', { status: 429, statusText: 'Too Many Requests' })
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService)

      await expect(service.fetchStatusPage({ nationwide: true })).rejects.toMatchObject({
        failureKind: 'RATE_LIMITED',
        retryable: true,
        statusCode: 429,
      })
    })

    it('should map HTTP 401/403 to AUTHENTICATION (retryable: false)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService)

      await expect(service.fetchStatusPage({ nationwide: true })).rejects.toMatchObject({
        failureKind: 'AUTHENTICATION',
        retryable: false,
        statusCode: 401,
      })
    })

    it('should map HTTP 404 to CONTRACT_CHANGED (retryable: false)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' })
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService)

      await expect(service.fetchStatusPage({ nationwide: true })).rejects.toMatchObject({
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
        statusCode: 404,
      })
    })

    it('should map HTTP 500/503 to UPSTREAM_UNAVAILABLE (retryable: true)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' })
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService)

      await expect(service.fetchStatusPage({ nationwide: true })).rejects.toMatchObject({
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        statusCode: 503,
      })
    })

    it('should map HTTP 504 to TIMEOUT (retryable: true)', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Gateway Timeout', { status: 504, statusText: 'Gateway Timeout' })
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService)

      await expect(service.fetchStatusPage({ nationwide: true })).rejects.toMatchObject({
        failureKind: 'TIMEOUT',
        retryable: true,
        statusCode: 504,
      })
    })

    it('should handle response body read failure as UPSTREAM_UNAVAILABLE', async () => {
      const mockFetch: typeof globalThis.fetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => {
            throw new Error('Stream broken during body read')
          },
        } as unknown as Response
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })

      await expect(
        apiService.getChargerStatus({ pageNo: 1, numOfRows: 9999, period: 5 }),
      ).rejects.toMatchObject({
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
      })
    })

    it('assertConfigured should throw when serviceKey is unconfigured', async () => {
      const apiService = new KecoAPIService({
        serviceKey: '__UNCONFIGURED__',
        endpoint,
        timeoutMs: 8000,
        fetchFn: async () => new Response(''),
      })

      await expect(
        apiService.getChargerStatus({ pageNo: 1, numOfRows: 9999, period: 5 }),
      ).rejects.toMatchObject({
        failureKind: 'AUTHENTICATION',
        retryable: false,
      })
    })
  })

  describe('COV-010 & COV-011: Central KECO Configuration with Controlled process.env', () => {
    const savedEnv = { ...process.env }

    afterEach(() => {
      process.env = { ...savedEnv }
    })

    it('COV-010: should load custom KECO_API_KEY, KECO_API_URL, and positive integer KECO_API_TIMEOUT', () => {
      jest.isolateModules(() => {
        process.env.KECO_API_KEY = 'CUSTOM_KEY_ABC_123'
        process.env.KECO_API_URL = 'https://custom.keco.gov.kr/EvCharger'
        process.env.KECO_API_TIMEOUT = '15000'

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { config: isolatedConfig } = require('zido/common')
        expect(isolatedConfig.charger.serviceKey).toBe('CUSTOM_KEY_ABC_123')
        expect(isolatedConfig.charger.endpoint).toBe('https://custom.keco.gov.kr/EvCharger')
        expect(isolatedConfig.charger.timeoutMs).toBe(15000)
      })
    })

    it('COV-011: should coalesce missing or empty/whitespace/invalid KECO_API_URL to default endpoint', () => {
      const candidateUrls = [undefined, '', '   ', 'invalid-url-string', 'ftp://unsupported.proto/path']
      for (const candidate of candidateUrls) {
        jest.isolateModules(() => {
          if (candidate === undefined) {
            delete process.env.KECO_API_URL
          } else {
            process.env.KECO_API_URL = candidate
          }
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { config: isolatedConfig } = require('zido/common')
          expect(isolatedConfig.charger.endpoint).toBe('https://apis.data.go.kr/B552584/EvCharger')
        })
      }
    })

    it('COV-011: should coalesce missing, non-positive, or non-integer KECO_API_TIMEOUT to default 8000ms', () => {
      const candidateTimeouts = [undefined, '', '   ', '0', '-5000', 'not-a-number', '3.14', 'NaN', 'Infinity']
      for (const candidate of candidateTimeouts) {
        jest.isolateModules(() => {
          if (candidate === undefined) {
            delete process.env.KECO_API_TIMEOUT
          } else {
            process.env.KECO_API_TIMEOUT = candidate
          }
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { config: isolatedConfig } = require('zido/common')
          expect(isolatedConfig.charger.timeoutMs).toBe(8000)
        })
      }
    })

    it('COV-011: should fail with AUTHENTICATION when KECO_API_KEY is missing/empty during invocation', async () => {
      await new Promise<void>((resolve, reject) => {
        jest.isolateModules(async () => {
          try {
            process.env.KECO_API_KEY = ''
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { config: isolatedConfig } = require('zido/common')
            expect(isolatedConfig.charger.serviceKey).toBe('')

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { KecoAPIService: IsolatedAPIService, KecoService: IsolatedService } = require('../src')
            const apiService = new IsolatedAPIService({
              serviceKey: isolatedConfig.charger.serviceKey || '__UNCONFIGURED__',
              endpoint: isolatedConfig.charger.endpoint,
              timeoutMs: isolatedConfig.charger.timeoutMs,
              fetchFn: async () => new Response(''),
            })
            const service = new IsolatedService(apiService)

            await expect(service.fetchStatusPage({ nationwide: true })).rejects.toMatchObject({
              failureKind: 'AUTHENTICATION',
              retryable: false,
            })
            await expect(service.fetchInfoPage({ nationwide: true })).rejects.toMatchObject({
              failureKind: 'AUTHENTICATION',
              retryable: false,
            })
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      })
    })
  })

  describe('COV-012 & COV-013: KecoService Success Processing & Telemetry', () => {
    it('COV-012: fetchStatusPage should parse XML and record success telemetry event metadata', async () => {
      const mockXml = readFixture('status-success.xml')
      const telemetry = new ChargerTelemetry()
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response(mockXml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService, { telemetry })

      const result = await service.fetchStatusPage({
        pageNo: 1,
        numOfRows: 9999,
        period: 5,
        nationwide: true,
      })
      expect(result.resultCode).toBe('00')
      expect(result.totalCount).toBe(2)
      expect(result.items).toHaveLength(2)
      expect(result.items[0]).toMatchObject({
        busiId: 'ME',
        statId: '28260005',
        chgerId: '01',
        stat: '2',
        statUpdDt: '20190829121020',
      })

      const events = telemetry.snapshot()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        provider: 'keco',
        endpoint: '/getChargerStatus',
        resultCode: '00',
        httpStatus: 200,
        itemCount: 2,
        retryCount: 0,
        quotaState: 'OK',
      })
      expect(typeof events[0].latencyMs).toBe('number')
      expect(events[0].latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('COV-012: fetchInfoPage should parse XML and record success telemetry event metadata', async () => {
      const mockXml = readFixture('info-success.xml')
      const telemetry = new ChargerTelemetry()
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response(mockXml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService, { telemetry })

      const result = await service.fetchInfoPage({ pageNo: 1, numOfRows: 9999, nationwide: true })
      expect(result.resultCode).toBe('00')
      expect(result.totalCount).toBe(1)
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        busiId: 'ME',
        statId: '28260005',
        chgerId: '01',
        statNm: '환경부 종합청사 충전소',
      })

      const events = telemetry.snapshot()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        provider: 'keco',
        endpoint: '/getChargerInfo',
        resultCode: '00',
        httpStatus: 200,
        itemCount: 1,
        retryCount: 0,
        quotaState: 'OK',
      })
      expect(typeof events[0].latencyMs).toBe('number')
      expect(events[0].latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('COV-013: fetchStatusPage should handle NO_DATA (03) as successful empty page with telemetry', async () => {
      const mockXml = readFixture('status-nodata.xml')
      const telemetry = new ChargerTelemetry()
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response(mockXml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      const apiService = new KecoAPIService({
        serviceKey: 'TEST_KEY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService, { telemetry })

      const result = await service.fetchStatusPage({ nationwide: true })
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
        retryCount: 0,
        quotaState: 'OK',
      })
      expect(typeof events[0].latencyMs).toBe('number')
      expect(events[0].latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('records telemetry on error with quota state and httpStatus without leaking secrets', async () => {
      const telemetry = new ChargerTelemetry()
      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response('Rate limited', { status: 429, statusText: 'Too Many Requests' })
      }

      const apiService = new KecoAPIService({
        serviceKey: 'SECRET_KEY_FOR_TELEMETRY',
        endpoint,
        timeoutMs: 8000,
        fetchFn: mockFetch,
      })
      const service = new KecoService(apiService, { telemetry })

      await expect(service.fetchStatusPage({ nationwide: true })).rejects.toThrow(KecoProviderError)
      const events = telemetry.snapshot()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        provider: 'keco',
        endpoint: '/getChargerStatus',
        httpStatus: 429,
        itemCount: 0,
        retryCount: 0,
        quotaState: 'RATE_LIMITED',
      })
      expect(typeof events[0].latencyMs).toBe('number')
      expect(events[0].latencyMs).toBeGreaterThanOrEqual(0)
      expect(JSON.stringify(events[0])).not.toContain('SECRET_KEY_FOR_TELEMETRY')
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
