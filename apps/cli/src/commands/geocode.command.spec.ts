import type { PlaceService } from 'zido/place-domain'
import { GeocodeCommandInputSchema, executeGeocodeCommand } from './geocode.command'

describe('geocode.command', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('주소를 service.geocode에 그대로 전달하고 결과를 반환한다', async () => {
    const result = {
      lat: 37.556,
      lng: 126.972,
      provider: 'kakao',
      raw: { ok: true },
    }
    const service = {
      geocode: jest.fn().mockResolvedValue(result),
    } as unknown as PlaceService
    const input = GeocodeCommandInputSchema.parse({ address: '  서울역  ' })

    await expect(executeGeocodeCommand(service, input)).resolves.toBe(result)

    expect(service.geocode).toHaveBeenCalledWith({ address: '서울역' })
  })

  it('공백 주소는 schema에서 거부한다', () => {
    expect(GeocodeCommandInputSchema.safeParse({ address: '   ' }).success).toBe(false)
  })
})
