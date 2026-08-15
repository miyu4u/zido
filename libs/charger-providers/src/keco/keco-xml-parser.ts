import { KecoInfoItem, KecoStatusItem, ProviderPage, KECO_RESULT_CODES } from './keco-contracts'
import { KecoProviderError, createKecoErrorFromResultCode } from './keco-errors'

/**
 * Maximum allowed XML size to prevent memory exhaustion (50MB)
 */
const MAX_XML_SIZE_BYTES = 50 * 1024 * 1024

/**
 * Bounded XML parser for KECO OpenAPI responses.
 * Implements pure TypeScript XML parsing without external dependencies.
 */
export class KecoXmlParser {
  /**
   * Parses a KECO getChargerStatus XML response into a typed ProviderPage<KecoStatusItem>.
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
   * Parses a KECO getChargerInfo XML response into a typed ProviderPage<KecoInfoItem>.
   * Strictly extracts documented v1.25 fields and ignores unknown elements.
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
   * Generic XML response parser for KECO responses.
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

    // A resultCode outside a recognized header is not a valid KECO envelope.
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

    // Handle NO_DATA (03) as a successful empty page
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
      const rawPageNo = this.parseTagValue(bodyBlock, 'pageNo')
      const rawNumOfRows = this.parseTagValue(bodyBlock, 'numOfRows')
      const rawTotalCount = this.parseTagValue(bodyBlock, 'totalCount')
      if (rawPageNo === null || rawNumOfRows === null || rawTotalCount === null) {
        throw new KecoProviderError('Invalid KECO XML response: Missing pagination metadata.', {
          failureKind: 'CONTRACT_CHANGED',
          retryable: false,
        })
      }
      const pageNo = parseInt(rawPageNo, 10)
      const numOfRows = parseInt(rawNumOfRows, 10)
      const totalCount = parseInt(rawTotalCount, 10)
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

    // Non-00 and non-03 resultCode is failure
    if (resultCode !== KECO_RESULT_CODES.OK) {
      throw createKecoErrorFromResultCode(resultCode, resultMsg)
    }

    // Extract and validate body
    const bodyBlock = this.extractTagContent(cleanXml, 'body')
    if (bodyBlock === null) {
      throw new KecoProviderError('Invalid KECO XML response: Missing body element.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }

    // Extract and validate required pagination metadata
    const rawPageNo = this.parseTagValue(bodyBlock, 'pageNo')
    const rawNumOfRows = this.parseTagValue(bodyBlock, 'numOfRows')
    const rawTotalCount = this.parseTagValue(bodyBlock, 'totalCount')

    if (rawPageNo === null || rawNumOfRows === null || rawTotalCount === null) {
      throw new KecoProviderError('Invalid KECO XML response: Missing pagination metadata.', {
        failureKind: 'CONTRACT_CHANGED',
        retryable: false,
      })
    }

    const pageNo = parseInt(rawPageNo, 10)
    const numOfRows = parseInt(rawNumOfRows, 10)
    const totalCount = parseInt(rawTotalCount, 10)

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

    // Extract items
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

  /**
   * Strips XML comments and declarations.
   */
  private stripCommentsAndDeclarations(xml: string): string {
    return xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[\s\S]*?\?>/g, '')
  }

  /**
   * Extracts inner content of a given tag.
   */
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

  /**
   * Extracts and cleans tag text value.
   */
  private parseTagValue(xml: string, tagName: string): string | null {
    const content = this.extractTagContent(xml, tagName)
    if (content === null) {
      return null
    }
    return this.cleanText(content)
  }

  /**
   * Parses direct child tags of an <item> block into key-value map.
   */
  private parseItemFields(itemXml: string): Record<string, string> {
    const fields: Record<string, string> = {}
    const tagRegex = /<([a-zA-Z0-9_]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi
    let match: RegExpExecArray | null
    while ((match = tagRegex.exec(itemXml)) !== null) {
      fields[match[1]] = this.cleanText(match[2])
    }
    return fields
  }

  /**
   * Cleans text by resolving CDATA and decoding XML entities.
   */
  private cleanText(raw: string): string {
    let text = raw
    if (text.includes('<![CDATA[')) {
      text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    }
    return this.decodeXmlEntities(text).trim()
  }

  /**
   * Decodes standard and numeric XML entities.
   */
  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => {
        const code = parseInt(dec, 10)
        return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _
      })
      .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => {
        const code = parseInt(hex, 16)
        return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _
      })
      .replace(/&amp;/g, '&')
  }
}
