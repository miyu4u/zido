import * as fs from 'fs'
import * as path from 'path'
import { KecoUpstreamProviderException } from '../src'
import { KEcoXmlParser } from '../src/k-eco/k-eco-xml-parser'

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/keco')

function fixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')
}

describe('KEcoXmlParser', () => {
  const parser = new KEcoXmlParser()

  it('상태 응답과 페이지 metadata를 검증한다', () => {
    const page = parser.parseStatusPage(fixture('status-success.xml'))

    expect(page).toMatchObject({ resultCode: '00', pageNo: 1, totalCount: 2 })
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).toMatchObject({ statId: '28260005', chgerId: '01', stat: '2' })
  })

  it('충전소 정보 응답의 공식 필드만 매핑한다', () => {
    const page = parser.parseInfoPage(fixture('info-success.xml'))

    expect(page).toMatchObject({ resultCode: '00', pageNo: 1, totalCount: 1 })
    expect(page.items[0]).toMatchObject({
      statId: '28260005',
      chgerId: '01',
      statNm: '환경부 종합청사 충전소',
    })
  })

  it('NO_DATA를 성공한 빈 페이지로 반환한다', () => {
    const page = parser.parseStatusPage(fixture('status-nodata.xml'))

    expect(page.resultCode).toBe('03')
    expect(page.totalCount).toBe(0)
    expect(page.items).toEqual([])
  })

  it.each([
    ['error-05.xml', 'TIMEOUT', true],
    ['error-12.xml', 'CONTRACT_CHANGED', false],
    ['error-22.xml', 'QUOTA_EXHAUSTED', false],
    ['error-23.xml', 'RATE_LIMITED', true],
  ] as const)('%s 결과 코드를 provider 오류로 변환한다', (filename, failureKind, retryable) => {
    try {
      parser.parseStatusPage(fixture(filename))
      fail('expected parser to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(KecoUpstreamProviderException)
      expect(error).toMatchObject({ failureKind, retryable })
    }
  })

  it.each(['malformed-missing-body.xml', 'malformed-invalid-pagination.xml', 'malformed-missing-identity.xml'])(
    '%s 계약 위반을 숨기지 않는다',
    (filename) => {
      expect(() => parser.parseStatusPage(fixture(filename))).toThrow(KecoUpstreamProviderException)
    },
  )
})
