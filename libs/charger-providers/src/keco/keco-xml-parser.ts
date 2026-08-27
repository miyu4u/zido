import { KECO_RESULT_CODES } from './types'
import type { KecoInfoItem, KecoStatusItem, ProviderPage } from './types'
import { KecoProviderError, createKecoErrorFromResultCode } from './keco.exception'

/**
 * 메모리 고갈 공격 방지를 위한 최대 허용 XML 바이트 크기 (50MB).
 */
const MAX_XML_SIZE_BYTES = 50 * 1024 * 1024

/**
 * KECO OpenAPI XML 응답을 파싱하는 고성능 순수 TypeScript XML 파서.
 */
export class KecoXmlParser {
  /**
   * KECO getChargerStatus XML 응답을 ProviderPage<KecoStatusItem> 구조로 파싱한다.
   *
   * @param xml 원본 XML 응답 문자열
   * @returns 파싱 및 검증된 충전기 상태 페이지 객체
   */
  public parseStatusPage(xml: string): ProviderPage<KecoStatusItem> {
    return this.parseResponse(xml, (fields) => {
      return {
        busiId: fields['busiId'] ?? null,
        statId: fields['statId'] ?? null,
        chgerId: fields['chgerId'] ?? null,
        stat: fields['stat'] ?? null,
        statUpdDt: fields['statUpdDt'] ?? null,
      }
    })
  }

  /**
   * KECO getChargerInfo XML 응답을 ProviderPage<KecoInfoItem> 구조로 파싱한다.
   * 공식 v1.25 가이드의 정의된 필드만 추출하고 알 수 없는 태그는 무시한다.
   *
   * @param xml 원본 XML 응답 문자열
   * @returns 파싱 및 검증된 충전소 기본 정보 페이지 객체
   */
  public parseInfoPage(xml: string): ProviderPage<KecoInfoItem> {
    return this.parseResponse(xml, (fields) => {
      const addr = fields['addr'] ?? fields['address'] ?? null
      const address = fields['address'] ?? fields['addr'] ?? null
      const detail = fields['detail'] ?? fields['location'] ?? fields['addrDetail'] ?? null
      const location = fields['location'] ?? detail
      const addrDetail = fields['addrDetail'] ?? detail
      const busiNm = fields['busiNm'] ?? fields['busnNm'] ?? null
      const busnNm = fields['busnNm'] ?? fields['busiNm'] ?? null

      return {
        busiId: fields['busiId'] ?? null,
        statId: fields['statId'] ?? null,
        chgerId: fields['chgerId'] ?? null,
        statNm: fields['statNm'] ?? null,
        chgerType: fields['chgerType'] ?? null,
        addr,
        address,
        detail,
        location,
        addrDetail,
        lat: fields['lat'] ?? null,
        lng: fields['lng'] ?? null,
        useTime: fields['useTime'] ?? null,
        busiNm,
        busnNm,
        busiCall: fields['busiCall'] ?? null,
        stat: fields['stat'] ?? null,
        statUpdDt: fields['statUpdDt'] ?? null,
        lastTsdt: fields['lastTsdt'] ?? null,
        lastTedt: fields['lastTedt'] ?? null,
        nowTsdt: fields['nowTsdt'] ?? null,
        output: fields['output'] ?? null,
        method: fields['method'] ?? null,
        zcode: fields['zcode'] ?? null,
        zscode: fields['zscode'] ?? null,
        kind: fields['kind'] ?? null,
        kindDetail: fields['kindDetail'] ?? null,
        parkingFree: fields['parkingFree'] ?? null,
        note: fields['note'] ?? null,
        limitYn: fields['limitYn'] ?? null,
        limitDetail: fields['limitDetail'] ?? null,
        delYn: fields['delYn'] ?? null,
        delDetail: fields['delDetail'] ?? null,
        trafficYn: fields['trafficYn'] ?? null,
        year: fields['year'] ?? null,
        floorNum: fields['floorNum'] ?? null,
        floorType: fields['floorType'] ?? null,
      }
    })
  }

  /**
   * KECO XML 응답을 공통 검증하고 개별 아이템을 매핑하는 내부 헬퍼.
   */
  private parseResponse<T>(xml: string, itemMapper: (fields: Record<string, string>) => T): ProviderPage<T> {
    if (!xml || typeof xml !== 'string') {
      throw new KecoProviderError('Failed to parse KECO XML: Empty or invalid XML payload.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }

    if (xml.length > MAX_XML_SIZE_BYTES) {
      throw new KecoProviderError('Failed to parse KECO XML: Response exceeded maximum allowed size.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }

    const cleanXml = this.stripCommentsAndDeclarations(xml)

    const headerBlock = this.extractTagContent(cleanXml, 'header') ?? this.extractTagContent(cleanXml, 'cmmMsgHeader')
    if (headerBlock === null) {
      throw new KecoProviderError('Invalid KECO XML response: Missing header element.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }
    const resultCode =
      this.parseTagValue(headerBlock, 'resultCode') ?? this.parseTagValue(headerBlock, 'returnReasonCode')
    const resultMsg =
      this.parseTagValue(headerBlock, 'resultMsg') ?? this.parseTagValue(headerBlock, 'returnAuthMsg') ?? ''

    if (!resultCode) {
      throw new KecoProviderError('Invalid KECO XML response: Missing header resultCode.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }

    if (resultCode === KECO_RESULT_CODES.NO_DATA) {
      const bodyBlock = this.extractTagContent(cleanXml, 'body')
      if (bodyBlock === null) {
        throw new KecoProviderError('Invalid KECO XML response: Missing body element.', {
          failureKind: 'CONTRACT_CHANGED',
          retryable: false,
        })
      }
      if (!this.hasTag(bodyBlock, 'items')) {
        throw new KecoProviderError('Invalid KECO XML response: Missing items element.', {
          failureKind: 'CONTRACT_CHANGED',
          retryable: false,
        })
      }
      const rawPageNo =
        this.parseTagValue(bodyBlock, 'pageNo') ?? this.parseTagValue(headerBlock, 'pageNo')
      const rawNumOfRows =
        this.parseTagValue(bodyBlock, 'numOfRows') ?? this.parseTagValue(headerBlock, 'numOfRows')
      const rawTotalCount =
        this.parseTagValue(bodyBlock, 'totalCount') ?? this.parseTagValue(headerBlock, 'totalCount')
      if (rawPageNo === null || rawNumOfRows === null || rawTotalCount === null) {
        throw new KecoProviderError('Invalid KECO XML response: Missing pagination metadata.', {
          failureKind: 'CONTRACT_CHANGED',
          retryable: false,
        })
      }
      const pageNo = Number(rawPageNo)
      const numOfRows = Number(rawNumOfRows)
      const totalCount = Number(rawTotalCount)
      if (
        !Number.isSafeInteger(pageNo) ||
        pageNo < 1 ||
        !Number.isSafeInteger(numOfRows) ||
        numOfRows < 0 ||
        !Number.isSafeInteger(totalCount) ||
        totalCount < 0
      ) {
        throw new KecoProviderError('Invalid KECO XML response: Malformed pagination metadata values.', {
          failureKind: 'CONTRACT_CHANGED',
          retryable: false,
        })
      }
      return {
        resultCode,
        resultMsg: resultMsg || 'NO_DATA',
        pageNo,
        numOfRows,
        totalCount,
        items: [],
      }
    }

    if (resultCode !== KECO_RESULT_CODES.OK) {
      throw createKecoErrorFromResultCode(resultCode, resultMsg)
    }

    const bodyBlock = this.extractTagContent(cleanXml, 'body')
    if (bodyBlock === null) {
      throw new KecoProviderError('Invalid KECO XML response: Missing body element.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }

    const rawPageNo =
      this.parseTagValue(bodyBlock, 'pageNo') ?? this.parseTagValue(headerBlock, 'pageNo')
    const rawNumOfRows =
      this.parseTagValue(bodyBlock, 'numOfRows') ?? this.parseTagValue(headerBlock, 'numOfRows')
    const rawTotalCount =
      this.parseTagValue(bodyBlock, 'totalCount') ?? this.parseTagValue(headerBlock, 'totalCount')

    if (rawPageNo === null || rawNumOfRows === null || rawTotalCount === null) {
      throw new KecoProviderError('Invalid KECO XML response: Missing pagination metadata.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }

    const pageNo = Number(rawPageNo)
    const numOfRows = Number(rawNumOfRows)
    const totalCount = Number(rawTotalCount)

    if (
      !Number.isSafeInteger(pageNo) ||
      pageNo < 1 ||
      !Number.isSafeInteger(numOfRows) ||
      numOfRows < 0 ||
      !Number.isSafeInteger(totalCount) ||
      totalCount < 0
    ) {
      throw new KecoProviderError('Invalid KECO XML response: Malformed pagination metadata values.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }

    if (!this.hasTag(bodyBlock, 'items')) {
      throw new KecoProviderError('Invalid KECO XML response: Missing items element.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }

    const itemsBlock = this.extractTagContent(bodyBlock, 'items')
    const items: T[] = []
    if (itemsBlock && itemsBlock.trim() !== '') {
      const itemRegex = /<item(?:\s+[^>]*)?>([\s\S]*?)<\/item>/gi
      let match: RegExpExecArray | null
      while ((match = itemRegex.exec(itemsBlock)) !== null) {
        const itemFields = this.parseItemFields(match[1])
        if (
          !itemFields['statId'] ||
          !itemFields['statId'].trim() ||
          !itemFields['chgerId'] ||
          !itemFields['chgerId'].trim()
        ) {
          throw new KecoProviderError(
            'Invalid KECO XML response: Item is missing required identity fields (statId, chgerId).',
            {
              failureKind: 'CONTRACT_CHANGED',
              retryable: false,
            },
          )
        }
        items.push(itemMapper(itemFields))
      }
    }

    return {
      resultCode,
      resultMsg,
      pageNo,
      numOfRows,
      totalCount,
      items,
    }
  }

  private stripCommentsAndDeclarations(xml: string): string {
    return xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[\s\S]*?\?>/g, '')
  }

  private extractTagContent(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i')
    const match = xml.match(regex)
    return match ? match[1] : null
  }

  private hasTag(xml: string, tagName: string): boolean {
    const paired = new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>`, 'i')
    const selfClosing = new RegExp(`<${tagName}(?:\\s[^>]*)?\\s*/>`, 'i')
    return paired.test(xml) || selfClosing.test(xml)
  }

  private parseTagValue(xml: string, tagName: string): string | null {
    const content = this.extractTagContent(xml, tagName)
    if (content === null) {
      return null
    }
    return this.cleanText(content)
  }

  private parseItemFields(itemXml: string): Record<string, string> {
    const fields: Record<string, string> = {}
    const tagRegex = /<([a-zA-Z0-9_]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi
    let match: RegExpExecArray | null
    while ((match = tagRegex.exec(itemXml)) !== null) {
      const tagName = match[1]
      const tagContent = match[2]
      fields[tagName] = this.cleanText(tagContent)
    }
    return fields
  }

  private cleanText(raw: string): string {
    let text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
    return text.trim()
  }
}
