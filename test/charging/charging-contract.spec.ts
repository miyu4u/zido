import { ChargerTelemetry } from 'zido/common'
import { redactExternalUrl, redactSensitiveText } from 'zido/charger-providers'

describe('charging security and telemetry contract', () => {
  it('redacts service keys, authorization values, and external query strings', () => {
    const input =
      'https://apis.data.go.kr/B552584/EvCharger/getChargerStatus?ServiceKey=secret-key&pageNo=1 ' +
      'Authorization: Bearer very-secret-token'
    const redacted = redactSensitiveText(input)

    expect(redacted).not.toContain('secret-key')
    expect(redacted).not.toContain('very-secret-token')
    expect(redactExternalUrl(input)).toContain('https://apis.data.go.kr/B552584/EvCharger/getChargerStatus')
    expect(redactExternalUrl(input)).not.toContain('?')
    expect(redactExternalUrl(input)).not.toContain('secret-key')
  })

  it('records bounded provider metrics without allowing query-bearing endpoints', () => {
    const telemetry = new ChargerTelemetry()
    telemetry.record({
      provider: 'keco',
      endpoint: '/getChargerStatus?ServiceKey=secret',
      resultCode: '00',
      httpStatus: 200,
      latencyMs: 12,
      itemCount: 2,
      freshness: 'FRESH',
      retryCount: 0,
    })

    expect(telemetry.snapshot()).toEqual([
      expect.objectContaining({
        provider: 'keco',
        endpoint: '/getChargerStatus',
        resultCode: '00',
        itemCount: 2,
      }),
    ])
    expect(JSON.stringify(telemetry.snapshot())).not.toContain('secret')
  })

  it('evicts the oldest metrics when the configured sink bound is reached', () => {
    const telemetry = new ChargerTelemetry(2)
    for (const resultCode of ['01', '02', '03']) {
      telemetry.record({
        provider: 'keco',
        endpoint: '/getChargerStatus',
        resultCode,
        latencyMs: 1,
      })
    }

    expect(telemetry.snapshot().map((event) => event.resultCode)).toEqual(['02', '03'])
  })
})
