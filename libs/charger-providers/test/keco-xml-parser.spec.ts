import * as fs from 'fs'
import * as path from 'path'
import { KecoProviderError, KecoXmlParser } from '../src'

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/keco')

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')
}

describe('KecoXmlParser', () => {
  let parser: KecoXmlParser

  beforeEach(() => {
    parser = new KecoXmlParser()
  })

  describe('parseStatusPage', () => {
    it('should parse success status XML with items and pagination metadata', () => {
      const xml = readFixture('status-success.xml')
      const result = parser.parseStatusPage(xml)

      expect(result.resultCode).toBe('00')
      expect(result.resultMsg).toBe('OK')
      expect(result.pageNo).toBe(1)
      expect(result.numOfRows).toBe(9999)
      expect(result.totalCount).toBe(2)
      expect(result.items).toHaveLength(2)

      expect(result.items[0]).toEqual({
        busiId: 'ME',
        statId: '28260005',
        chgerId: '01',
        stat: '2',
        statUpdDt: '20190829121020',
      })
      expect(result.items[1]).toEqual({
        busiId: 'ME',
        statId: '28260005',
        chgerId: '02',
        stat: '3',
        statUpdDt: '20190829121500',
      })
    })

    it('should parse empty status XML fixture returning empty array', () => {
      const xml = readFixture('status-empty.xml')
      const result = parser.parseStatusPage(xml)

      expect(result.resultCode).toBe('00')
      expect(result.resultMsg).toBe('OK')
      expect(result.pageNo).toBe(1)
      expect(result.numOfRows).toBe(9999)
      expect(result.totalCount).toBe(0)
      expect(result.items).toEqual([])
    })

    it('should parse NO_DATA (03) fixture as a successful empty page without throwing', () => {
      const xml = readFixture('status-nodata.xml')
      const result = parser.parseStatusPage(xml)

      expect(result.resultCode).toBe('03')
      expect(result.resultMsg).toBe('NODATA_ERROR')
      expect(result.pageNo).toBe(1)
      expect(result.numOfRows).toBe(9999)
      expect(result.totalCount).toBe(0)
      expect(result.items).toEqual([])
    })
  })

  describe('parseInfoPage', () => {
    it('should parse success info XML with documented v1.25 fields', () => {
      const xml = readFixture('info-success.xml')
      const result = parser.parseInfoPage(xml)

      expect(result.resultCode).toBe('00')
      expect(result.resultMsg).toBe('OK')
      expect(result.pageNo).toBe(1)
      expect(result.numOfRows).toBe(9999)
      expect(result.totalCount).toBe(1)
      expect(result.items).toHaveLength(1)

      const item = result.items[0]
      expect(item.busiId).toBe('ME')
      expect(item.statId).toBe('28260005')
      expect(item.chgerId).toBe('01')
      expect(item.statNm).toBe('환경부 종합청사 충전소')
      expect(item.addr).toBe('인천광역시 서구 환경로 42')
      expect(item.address).toBe('인천광역시 서구 환경로 42')
      expect(item.lat).toBe('37.5665')
      expect(item.lng).toBe('126.9780')
      expect(item.useTime).toBe('24시간 이용가능')
      expect(item.busiNm).toBe('환경부')
      expect(item.busiCall).toBe('1661-9408')
      expect(item.chgerType).toBe('01')
      expect(item.output).toBe('50')
      expect(item.parkingFree).toBe('Y')
    })

    it('should ignore unknown XML elements in item', () => {
      const xmlWithUnknown = `
        <response>
          <header>
            <resultCode>00</resultCode>
            <resultMsg>OK</resultMsg>
          </header>
          <body>
            <items>
              <item>
                <busiId>ME</busiId>
                <statId>1001</statId>
                <chgerId>01</chgerId>
                <unknownField1>test</unknownField1>
                <unsupportedNestedTag>value</unsupportedNestedTag>
              </item>
            </items>
            <numOfRows>10</numOfRows>
            <pageNo>1</pageNo>
            <totalCount>1</totalCount>
          </body>
        </response>
      `
      const result = parser.parseInfoPage(xmlWithUnknown)
      expect(result.items).toHaveLength(1)
      const item = result.items[0] as unknown as Record<string, unknown>
      expect(item['unknownField1']).toBeUndefined()
      expect(item['unsupportedNestedTag']).toBeUndefined()
      expect(item['busiId']).toBe('ME')
      expect(item['statId']).toBe('1001')
    })
  })

  describe('Error Fixture Result Code Mapping', () => {
    it('error-05.xml -> TIMEOUT (retryable: true)', () => {
      const xml = readFixture('error-05.xml')
      expect(() => parser.parseStatusPage(xml)).toThrow(KecoProviderError)
      try {
        parser.parseStatusPage(xml)
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.resultCode).toBe('05')
        expect(error.failureKind).toBe('TIMEOUT')
        expect(error.retryable).toBe(true)
      }
    })

    it('error-10.xml -> INVALID_REQUEST (retryable: false)', () => {
      const xml = readFixture('error-10.xml')
      try {
        parser.parseStatusPage(xml)
        fail('Expected parseStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.resultCode).toBe('10')
        expect(error.failureKind).toBe('INVALID_REQUEST')
        expect(error.retryable).toBe(false)
      }
    })

    it('error-12.xml -> CONTRACT_CHANGED (retryable: false)', () => {
      const xml = readFixture('error-12.xml')
      try {
        parser.parseStatusPage(xml)
        fail('Expected parseStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.resultCode).toBe('12')
        expect(error.failureKind).toBe('CONTRACT_CHANGED')
        expect(error.retryable).toBe(false)
      }
    })

    it('error-20.xml -> AUTHENTICATION (retryable: false)', () => {
      const xml = readFixture('error-20.xml')
      try {
        parser.parseStatusPage(xml)
        fail('Expected parseStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.resultCode).toBe('20')
        expect(error.failureKind).toBe('AUTHENTICATION')
        expect(error.retryable).toBe(false)
      }
    })

    it('error-22.xml -> QUOTA_EXHAUSTED (retryable: false)', () => {
      const xml = readFixture('error-22.xml')
      try {
        parser.parseStatusPage(xml)
        fail('Expected parseStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.resultCode).toBe('22')
        expect(error.failureKind).toBe('QUOTA_EXHAUSTED')
        expect(error.retryable).toBe(false)
      }
    })

    it('error-23.xml -> RATE_LIMITED (retryable: true)', () => {
      const xml = readFixture('error-23.xml')
      try {
        parser.parseStatusPage(xml)
        fail('Expected parseStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.resultCode).toBe('23')
        expect(error.failureKind).toBe('RATE_LIMITED')
        expect(error.retryable).toBe(true)
      }
    })

    it('error-29.xml -> BLOCKED_NETWORK (retryable: false)', () => {
      const xml = readFixture('error-29.xml')
      try {
        parser.parseStatusPage(xml)
        fail('Expected parseStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.resultCode).toBe('29')
        expect(error.failureKind).toBe('BLOCKED_NETWORK')
        expect(error.retryable).toBe(false)
      }
    })

    it('error-30.xml -> AUTHENTICATION (retryable: false)', () => {
      const xml = readFixture('error-30.xml')
      try {
        parser.parseStatusPage(xml)
        fail('Expected parseStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.resultCode).toBe('30')
        expect(error.failureKind).toBe('AUTHENTICATION')
        expect(error.retryable).toBe(false)
      }
    })

    it('error-31.xml -> AUTHENTICATION (retryable: false)', () => {
      const xml = readFixture('error-31.xml')
      try {
        parser.parseStatusPage(xml)
        fail('Expected parseStatusPage to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.resultCode).toBe('31')
        expect(error.failureKind).toBe('AUTHENTICATION')
        expect(error.retryable).toBe(false)
      }
    })
  })

  describe('Entity decoding & CDATA parsing', () => {
    it('should decode XML entities and CDATA properly', () => {
      const xml = `
        <response>
          <header>
            <resultCode>00</resultCode>
            <resultMsg>OK</resultMsg>
          </header>
          <body>
            <items>
              <item>
                <busiId>ME</busiId>
                <statId>1001</statId>
                <chgerId>01</chgerId>
                <statNm><![CDATA[한국 & 공단 <테스트>]]></statNm>
                <note>주차료 &amp; 이용료 무료 &apos;24시&apos; &quot;운영&quot;</note>
              </item>
            </items>
            <numOfRows>10</numOfRows>
            <pageNo>1</pageNo>
            <totalCount>1</totalCount>
          </body>
        </response>
      `
      const result = parser.parseInfoPage(xml)
      expect(result.items[0].statNm).toBe('한국 & 공단 <테스트>')
      expect(result.items[0].note).toBe('주차료 & 이용료 무료 \'24시\' "운영"')
    })
  })

  describe('Malformed XML and boundary checks', () => {
    it('should throw CONTRACT_CHANGED on empty or whitespace XML', () => {
      expect(() => parser.parseStatusPage('')).toThrow(KecoProviderError)
      try {
        parser.parseStatusPage('')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.failureKind).toBe('CONTRACT_CHANGED')
        expect(error.retryable).toBe(false)
      }
    })

    it('should throw CONTRACT_CHANGED on XML missing header or resultCode', () => {
      const malformedXml = '<html><body>502 Bad Gateway</body></html>'
      try {
        parser.parseStatusPage(malformedXml)
        fail('Expected error')
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.failureKind).toBe('CONTRACT_CHANGED')
        expect(error.retryable).toBe(false)
        // Ensure no raw body leakage
        expect(error.message).not.toContain('502 Bad Gateway')
      }
    })

    it('should reject resultCode and pagination outside a recognized header', () => {
      const malformedXml = `
        <response>
          <resultCode>00</resultCode>
          <resultMsg>OK</resultMsg>
          <body>
            <items/>
            <numOfRows>10</numOfRows>
            <pageNo>1</pageNo>
            <totalCount>0</totalCount>
          </body>
        </response>
      `

      expect(() => parser.parseStatusPage(malformedXml)).toThrow(KecoProviderError)
      try {
        parser.parseStatusPage(malformedXml)
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        expect((err as KecoProviderError).failureKind).toBe('CONTRACT_CHANGED')
        expect((err as KecoProviderError).message).toContain('Missing header element')
      }
    })

    it('should throw CONTRACT_CHANGED when body element is missing in 00 response', () => {
      const xml = readFixture('malformed-missing-body.xml')
      expect(() => parser.parseStatusPage(xml)).toThrow(KecoProviderError)
      try {
        parser.parseStatusPage(xml)
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.failureKind).toBe('CONTRACT_CHANGED')
        expect(error.message).toContain('Missing body element')
      }
    })

    it('should throw CONTRACT_CHANGED when pagination metadata is invalid', () => {
      const xml = readFixture('malformed-invalid-pagination.xml')
      expect(() => parser.parseStatusPage(xml)).toThrow(KecoProviderError)
      try {
        parser.parseStatusPage(xml)
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.failureKind).toBe('CONTRACT_CHANGED')
        expect(error.message).toContain('Malformed pagination metadata')
      }
    })

    it('should throw CONTRACT_CHANGED when an item is missing required identity fields', () => {
      const xml = readFixture('malformed-missing-identity.xml')
      expect(() => parser.parseStatusPage(xml)).toThrow(KecoProviderError)
      try {
        parser.parseStatusPage(xml)
      } catch (err) {
        expect(err).toBeInstanceOf(KecoProviderError)
        const error = err as KecoProviderError
        expect(error.failureKind).toBe('CONTRACT_CHANGED')
        expect(error.message).toContain('missing required identity fields')
      }
    })
  })
})
