import type { PlaceService } from 'zido/place-domain'
import { ResolveCommandInputSchema, executeResolveCommand } from './resolve.command'

describe('resolve.command', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('검색어를 service.resolve에 그대로 전달하고 결과를 반환한다', async () => {
    const result = {
      name: '서울역 스타벅스',
      address: '서울특별시 용산구 한강대로 405',
      lat: 37.556,
      lng: 126.972,
      provider: 'google',
      raw: { ok: true },
    }
    const service = {
      resolve: jest.fn().mockResolvedValue(result),
    } as unknown as PlaceService
    const input = ResolveCommandInputSchema.parse({
      query: '  서울역 스타벅스  ',
    })

    await expect(executeResolveCommand(service, input)).resolves.toBe(result)

    expect(service.resolve).toHaveBeenCalledWith({ query: '서울역 스타벅스' })
  })

  it('공백 검색어는 schema에서 거부한다', () => {
    expect(ResolveCommandInputSchema.safeParse({ query: '   ' }).success).toBe(false)
  })
})
