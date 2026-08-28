import { HttpStatus } from '@nestjs/common'
import { KEcoAPIService } from './k-eco-api.service'
import { KecoInternalException, KecoUpstreamProviderException } from './k-eco.exception'

const ENDPOINT = 'https://apis.data.go.kr/B552584/EvCharger'
const SERVICE_KEY = 'TEST_SERVICE_KEY'

describe('KEcoAPIService', () => {
  let fetchSpy: jest.SpiedFunction<typeof globalThis.fetch>

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  describe('constructor validation', () => {
    it.each(['', '   '])('service key가 비어 있으면 내부 인증 오류를 반환한다', (serviceKey) => {
      expect(() => new KEcoAPIService({ serviceKey, endpoint: ENDPOINT, timeoutMs: 8_000 })).toThrow(
        expect.objectContaining({
          origin: 'INTERNAL',
          failureKind: 'AUTHENTICATION',
          retryable: false,
        }),
      )
    })

    it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])(
      '지원하지 않는 timeout %s를 내부 요청 오류로 거부한다',
      (timeoutMs) => {
        expect(() => new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: ENDPOINT, timeoutMs })).toThrow(
          expect.objectContaining({
            origin: 'INTERNAL',
            failureKind: 'INVALID_REQUEST',
            retryable: false,
          }),
        )
      },
    )

    it.each([
      'not-a-url',
      'http://apis.data.go.kr/B552584/EvCharger',
      `${ENDPOINT}?mode=test`,
      `${ENDPOINT}#fragment`,
      'https://user:password@apis.data.go.kr/B552584/EvCharger',
    ])('안전하지 않은 endpoint %s를 내부 요청 오류로 거부한다', (endpoint) => {
      expect(() => new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint, timeoutMs: 8_000 })).toThrow(
        KecoInternalException,
      )
    })
  })

  describe('request construction', () => {
    it('상태 조회 URL과 GET option에 검증된 query를 반영한다', async () => {
      fetchSpy.mockResolvedValue(new Response('<response/>', { status: 200 }))
      const service = new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: `${ENDPOINT}///`, timeoutMs: 8_000 })

      await expect(
        service.getChargerStatus({
          pageNo: 2,
          numOfRows: 50,
          period: 7,
          zcode: '11',
          kind: 'A0',
          kindDetail: 'A001',
        }),
      ).resolves.toBe('<response/>')

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [input, init] = fetchSpy.mock.calls[0]
      const url = new URL(String(input))
      expect(url.origin + url.pathname).toBe(`${ENDPOINT}/getChargerStatus`)
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        serviceKey: SERVICE_KEY,
        pageNo: '2',
        numOfRows: '50',
        period: '7',
        dataType: 'XML',
        zcode: '11',
        kind: 'A0',
        kindDetail: 'A001',
      })
      expect(init).toMatchObject({
        method: 'GET',
        redirect: 'error',
      })
      expect(init?.headers).toEqual({ Accept: 'application/xml, text/xml, */*' })
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    })

    it('정보 조회에 기본 pagination과 전국 범위를 적용하고 내부 flag는 전송하지 않는다', async () => {
      fetchSpy.mockResolvedValue(new Response('<info/>', { status: 200 }))
      const service = new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: ENDPOINT, timeoutMs: 8_000 })

      await expect(service.getChargerInfo({ nationwide: true })).resolves.toBe('<info/>')

      const url = new URL(String(fetchSpy.mock.calls[0][0]))
      expect(url.pathname).toBe('/B552584/EvCharger/getChargerInfo')
      expect(url.searchParams.get('pageNo')).toBe('1')
      expect(url.searchParams.get('numOfRows')).toBe('9999')
      expect(url.searchParams.get('dataType')).toBe('XML')
      expect(url.searchParams.has('nationwide')).toBe(false)
      expect(url.searchParams.has('period')).toBe(false)
    })
  })

  describe('scope and timeout', () => {
    it.each([{}, { nationwide: true, zcode: '11' }, { nationwide: true, zscode: '11000' }] as const)(
      '명시적 단일 수집 범위가 아닌 query를 내부 오류로 거부한다',
      async (query) => {
        const service = new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: ENDPOINT, timeoutMs: 8_000 })

        await expect(service.getChargerInfo(query)).rejects.toMatchObject({
          origin: 'INTERNAL',
          failureKind: 'INVALID_REQUEST',
          retryable: false,
        })
        expect(fetchSpy).not.toHaveBeenCalled()
      },
    )

    it('zscode 단독 지역 범위를 허용한다', async () => {
      fetchSpy.mockResolvedValue(new Response('<info/>', { status: 200 }))
      const service = new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: ENDPOINT, timeoutMs: 8_000 })

      await service.getChargerInfo({ zscode: '11000' })

      const url = new URL(String(fetchSpy.mock.calls[0][0]))
      expect(url.searchParams.get('zscode')).toBe('11000')
    })

    it('제한 시간이 지나면 요청을 중단하고 업스트림 timeout으로 분류한다', async () => {
      jest.useFakeTimers()
      fetchSpy.mockImplementation(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => {
                const error = new Error('request aborted')
                error.name = 'AbortError'
                reject(error)
              },
              { once: true },
            )
          }),
      )
      const service = new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: ENDPOINT, timeoutMs: 25 })

      const request = service.getChargerStatus({ nationwide: true })
      const rejection = expect(request).rejects.toMatchObject({
        origin: 'UPSTREAM_PROVIDER',
        failureKind: 'TIMEOUT',
        retryable: true,
      })
      await jest.advanceTimersByTimeAsync(25)
      await rejection
    })

    it('response body AbortError를 업스트림 timeout으로 보존한다', async () => {
      const abortError = new Error('body aborted')
      abortError.name = 'AbortError'
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockRejectedValue(abortError),
      } as unknown as Response)
      const service = new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: ENDPOINT, timeoutMs: 8_000 })

      await expect(service.getChargerInfo({ nationwide: true })).rejects.toMatchObject({
        origin: 'UPSTREAM_PROVIDER',
        failureKind: 'TIMEOUT',
        retryable: true,
      })
    })

    it('response body read 실패를 업스트림 unavailable로 변환한다', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockRejectedValue(new Error('stream closed')),
      } as unknown as Response)
      const service = new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: ENDPOINT, timeoutMs: 8_000 })

      await expect(service.getChargerInfo({ nationwide: true })).rejects.toMatchObject({
        origin: 'UPSTREAM_PROVIDER',
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        upstreamStatusCode: 200,
      })
    })
  })

  describe('upstream failures', () => {
    it.each([
      [400, 'INVALID_REQUEST', false, HttpStatus.BAD_REQUEST],
      [401, 'AUTHENTICATION', false, HttpStatus.UNAUTHORIZED],
      [403, 'BLOCKED_NETWORK', false, HttpStatus.FORBIDDEN],
      [408, 'TIMEOUT', true, HttpStatus.GATEWAY_TIMEOUT],
      [429, 'RATE_LIMITED', true, HttpStatus.TOO_MANY_REQUESTS],
      [404, 'CONTRACT_CHANGED', false, HttpStatus.BAD_GATEWAY],
      [500, 'UPSTREAM_UNAVAILABLE', true, HttpStatus.SERVICE_UNAVAILABLE],
      [503, 'UPSTREAM_UNAVAILABLE', true, HttpStatus.SERVICE_UNAVAILABLE],
    ] as const)(
      'HTTP %s를 %s 업스트림 오류로 변환한다',
      async (upstreamStatusCode, failureKind, retryable, publicStatus) => {
        fetchSpy.mockResolvedValue(new Response('', { status: upstreamStatusCode }))
        const service = new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: ENDPOINT, timeoutMs: 8_000 })

        const error = await service.getChargerStatus({ nationwide: true }).catch((cause: unknown) => cause)

        expect(error).toBeInstanceOf(KecoUpstreamProviderException)
        expect(error).toMatchObject({
          origin: 'UPSTREAM_PROVIDER',
          failureKind,
          retryable,
          upstreamStatusCode,
        })
        expect((error as KecoUpstreamProviderException).getStatus()).toBe(publicStatus)
      },
    )

    it('network rejection을 redacted 업스트림 오류로 변환한다', async () => {
      const secret = 'SECRET_KEY_IN_CAUSE'
      fetchSpy.mockRejectedValue(new Error(`failed?serviceKey=${secret}`))
      const service = new KEcoAPIService({ serviceKey: SERVICE_KEY, endpoint: ENDPOINT, timeoutMs: 8_000 })

      const error = await service.getChargerInfo({ nationwide: true }).catch((cause: unknown) => cause)

      expect(error).toBeInstanceOf(KecoUpstreamProviderException)
      expect(error).toMatchObject({
        origin: 'UPSTREAM_PROVIDER',
        failureKind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
      })
      expect(JSON.stringify((error as KecoUpstreamProviderException).getResponse())).not.toContain(secret)
      expect((error as KecoUpstreamProviderException).cause?.message).not.toContain(secret)
    })
  })
})
