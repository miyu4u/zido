import { KECO_RESULT_CODES } from './contracts/result-codes'
import { KecoInfoPageSchema, KecoStatusPageSchema, type KecoInfoPage, type KecoStatusPage } from './contracts/response'
import { createKecoErrorFromResultCode, KecoUpstreamProviderException } from './k-eco.exception'

/**
 * 비정상적으로 큰 upstream payload로 인한 메모리 고갈을 막는 한도
 */
const MAX_XML_SIZE_BYTES = 50 * 1024 * 1024

/**
 * KECO OpenAPI XML을 검증된 원천 page 계약으로 변환한다.
 */
export class KEcoXmlParser {
  parseStatusPage(xml: string): KecoStatusPage {
    const page = this.parsePage(xml, (fields) => ({
      busiId: fields['busiId'] ?? null,
      statId: fields['statId'] ?? null,
      chgerId: fields['chgerId'] ?? null,
      stat: fields['stat'] ?? null,
      statUpdDt: fields['statUpdDt'] ?? null,
      lastTsdt: fields['lastTsdt'] ?? null,
      lastTedt: fields['lastTedt'] ?? null,
      nowTsdt: fields['nowTsdt'] ?? null,
    }))
    return KecoStatusPageSchema.parse(page)
  }

  parseInfoPage(xml: string): KecoInfoPage {
    const page = this.parsePage(xml, (fields) => {
      const address = fields['addr'] ?? fields['address'] ?? null
      const detail = fields['addrDetail'] ?? fields['detail'] ?? fields['location'] ?? null

      return {
        busiId: fields['busiId'] ?? null,
        statId: fields['statId'] ?? null,
        chgerId: fields['chgerId'] ?? null,
        statNm: fields['statNm'] ?? null,
        chgerType: fields['chgerType'] ?? null,
        addr: address,
        address,
        addrDetail: detail,
        detail,
        location: fields['location'] ?? detail,
        lat: fields['lat'] ?? null,
        lng: fields['lng'] ?? null,
        useTime: fields['useTime'] ?? null,
        busiNm: fields['busiNm'] ?? fields['bnm'] ?? null,
        bnm: fields['bnm'] ?? fields['busiNm'] ?? null,
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
    return KecoInfoPageSchema.parse(page)
  }

  /**
   * 공통 header, pagination과 item identity를 검증한다.
   */
  private parsePage<T>(
    xml: string,
    mapItem: (fields: Record<string, string>) => T,
  ): {
    resultCode: string
    resultMsg: string
    pageNo: number
    numOfRows: number
    totalCount: number
    items: T[]
  } {
    if (!xml || Buffer.byteLength(xml, 'utf8') > MAX_XML_SIZE_BYTES) {
      throw this.contractError('KECO XML payload is empty or exceeds the supported size')
    }

    const normalizedXml = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[\s\S]*?\?>/g, '')
    const header = this.tagContent(normalizedXml, 'header') ?? this.tagContent(normalizedXml, 'cmmMsgHeader')
    if (header === null) throw this.contractError('KECO XML header is missing')

    const resultCode = this.tagValue(header, 'resultCode') ?? this.tagValue(header, 'returnReasonCode')
    const resultMsg = this.tagValue(header, 'resultMsg') ?? this.tagValue(header, 'returnAuthMsg') ?? ''
    if (!resultCode) throw this.contractError('KECO XML result code is missing')
    if (resultCode !== KECO_RESULT_CODES.OK && resultCode !== KECO_RESULT_CODES.NO_DATA) {
      throw createKecoErrorFromResultCode(resultCode, resultMsg)
    }

    const body = this.tagContent(normalizedXml, 'body')
    if (body === null) throw this.contractError('KECO XML body is missing')
    if (!this.hasTag(body, 'items')) throw this.contractError('KECO XML items element is missing')

    const pageNo = this.paginationValue(body, header, 'pageNo', 1)
    const numOfRows = this.paginationValue(body, header, 'numOfRows', 0)
    const totalCount = this.paginationValue(body, header, 'totalCount', 0)
    const items: T[] = []
    const itemsXml = this.tagContent(body, 'items')

    if (resultCode !== KECO_RESULT_CODES.NO_DATA && itemsXml) {
      const itemPattern = /<item(?:\s+[^>]*)?>([\s\S]*?)<\/item>/gi
      let match: RegExpExecArray | null
      while ((match = itemPattern.exec(itemsXml)) !== null) {
        const fields = this.itemFields(match[1])
        if (!fields['statId']?.trim() || !fields['chgerId']?.trim()) {
          throw this.contractError('KECO XML item identity is missing')
        }
        items.push(mapItem(fields))
      }
    }

    return {
      resultCode,
      resultMsg: resultMsg || (resultCode === KECO_RESULT_CODES.NO_DATA ? 'NO_DATA' : ''),
      pageNo,
      numOfRows,
      totalCount,
      items,
    }
  }

  private paginationValue(body: string, header: string, tag: string, minimum: number): number {
    const rawValue = this.tagValue(body, tag) ?? this.tagValue(header, tag)
    const value = rawValue === null ? Number.NaN : Number(rawValue)
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw this.contractError(`KECO XML ${tag} is missing or malformed`)
    }
    return value
  }

  private itemFields(xml: string): Record<string, string> {
    const fields: Record<string, string> = {}
    const pattern = /<([a-zA-Z0-9_]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi
    let match: RegExpExecArray | null
    while ((match = pattern.exec(xml)) !== null) fields[match[1]] = this.cleanText(match[2])
    return fields
  }

  private tagContent(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    return match ? match[1] : null
  }

  private tagValue(xml: string, tag: string): string | null {
    const content = this.tagContent(xml, tag)
    return content === null ? null : this.cleanText(content)
  }

  private hasTag(xml: string, tag: string): boolean {
    return new RegExp(`<${tag}(?:\\s[^>]*)?(?:\\s*/>|>[\\s\\S]*?<\\/${tag}>)`, 'i').test(xml)
  }

  private cleanText(value: string): string {
    return value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim()
  }

  private contractError(message: string): KecoUpstreamProviderException {
    return new KecoUpstreamProviderException(message, {
      failureKind: 'CONTRACT_CHANGED',
      retryable: false,
    })
  }
}
