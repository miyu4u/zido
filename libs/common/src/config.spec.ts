import { parseRegionCodes } from './config'

describe('charger region configuration', () => {
  const originalRegionCodes = process.env.CHARGER_DEFAULT_REGION_CODES

  afterEach(() => {
    if (originalRegionCodes === undefined) delete process.env.CHARGER_DEFAULT_REGION_CODES
    else process.env.CHARGER_DEFAULT_REGION_CODES = originalRegionCodes
    jest.resetModules()
  })

  it('comma-separated region set을 sorted unique code로 정규화한다', () => {
    expect(parseRegionCodes('41, 11,41')).toEqual(['11', '41'])
    expect(parseRegionCodes(undefined)).toEqual([])
  })

  it('2자리 숫자가 아닌 region code는 startup config 단계에서 거부한다', () => {
    expect(() => parseRegionCodes('11,seoul')).toThrow('Invalid region code in CHARGER_DEFAULT_REGION_CODES')
    expect(() => parseRegionCodes('1')).toThrow('Invalid region code in CHARGER_DEFAULT_REGION_CODES')
    expect(() => parseRegionCodes('99')).toThrow('Invalid region code in CHARGER_DEFAULT_REGION_CODES')
    expect(() => parseRegionCodes('11,,41')).toThrow('Invalid region code in CHARGER_DEFAULT_REGION_CODES')
  })

  it('controlled process.env를 full config loading에서 정규화하고 invalid startup을 거부한다', () => {
    process.env.CHARGER_DEFAULT_REGION_CODES = '41,11,41'
    jest.isolateModules(() => {
      const loaded = jest.requireActual('./config') as typeof import('./config')
      expect(loaded.config.charger.defaultRegionCodes).toEqual(['11', '41'])
    })

    process.env.CHARGER_DEFAULT_REGION_CODES = '99'
    expect(() =>
      jest.isolateModules(() => {
        jest.requireActual('./config')
      }),
    ).toThrow('Invalid region code in CHARGER_DEFAULT_REGION_CODES')
  })
})
