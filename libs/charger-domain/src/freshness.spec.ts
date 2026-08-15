import {
  evaluateFreshness,
  normalizeKecoStatus,
  parseUpstreamTimestamp,
  toEffectiveStatus,
} from './freshness'

describe('charger freshness and effective status', () => {
  const now = '2026-08-14T00:00:00.000Z'

  it.each([
    ['2', 'AVAILABLE'],
    ['3', 'CHARGING'],
    ['4', 'UNAVAILABLE'],
    ['5', 'MAINTENANCE'],
    ['0', 'UNKNOWN'],
    ['7', 'UNKNOWN'],
  ])('maps KECO v1.25 status %s conservatively', (rawStatus, expected) => {
    expect(normalizeKecoStatus(rawStatus)).toBe(expected)
  })

  it('parses the documented KECO compact timestamp as KST', () => {
    expect(parseUpstreamTimestamp('20260814090000')?.toISOString()).toBe('2026-08-14T00:00:00.000Z')
  })

  it.each([
    ['20260814085959', 'FRESH'],
    ['20260813235959', 'STALE'],
    [null, 'UNKNOWN'],
    ['not-a-date', 'UNKNOWN'],
    ['20260815000000', 'UNKNOWN'],
  ])('evaluates freshness for %s', (statusUpdatedAt, expected) => {
    expect(
      evaluateFreshness({
        statusUpdatedAt,
        now,
        ttlMs: 5 * 60 * 1000,
      }),
    ).toBe(expected)
  })

  it('never exposes stale AVAILABLE as effective AVAILABLE', () => {
    expect(toEffectiveStatus('AVAILABLE', 'FRESH')).toBe('AVAILABLE')
    expect(toEffectiveStatus('AVAILABLE', 'STALE')).toBe('UNKNOWN')
    expect(toEffectiveStatus('AVAILABLE', 'UNKNOWN')).toBe('UNKNOWN')
  })

  it('preserves non-available mapped states while showing freshness separately', () => {
    expect(toEffectiveStatus('CHARGING', 'STALE')).toBe('CHARGING')
    expect(toEffectiveStatus('MAINTENANCE', 'UNKNOWN')).toBe('MAINTENANCE')
  })
})
