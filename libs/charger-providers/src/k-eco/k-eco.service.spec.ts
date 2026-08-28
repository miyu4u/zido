import * as fs from 'fs'
import * as path from 'path'
import {
  ChargerInfoPageSchema,
  type ChargerInfoQuery,
  type ChargerProviderContract,
  ChargerStatusPageSchema,
  type ChargerStatusQuery,
} from '../charger-provider.contract'
import { KEcoAPIService } from './k-eco-api.service'
import { KEcoService } from './k-eco.service'
import { KecoInternalException, KecoUpstreamProviderException } from './k-eco.exception'
import { ChargerTelemetry } from 'zido/common'

const FIXTURES_DIR = path.resolve(__dirname, '../../test/fixtures/keco')

function loadFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')
}

describe('KEcoService', () => {
  let apiService: jest.Mocked<KEcoAPIService>
  let telemetry: ChargerTelemetry
  let service: KEcoService

  beforeEach(() => {
    apiService = {
      getChargerInfo: jest.fn(),
      getChargerStatus: jest.fn(),
    } as unknown as jest.Mocked<KEcoAPIService>
    telemetry = new ChargerTelemetry()
    service = new KEcoService(apiService, telemetry)
  })

  describe('contract & capabilities', () => {
    it('ChargerProviderContract 인터페이스를 충족하고 올바른 providerId와 capabilities를 선언한다', () => {
      const contractInstance: ChargerProviderContract = service

      expect(contractInstance.providerId).toBe('keco')
      expect(contractInstance.capabilities).toEqual({
        scopes: ['NATIONWIDE', 'REGION'],
        pagination: ['PAGE'],
        status: 'DYNAMIC',
        connectorDetails: true,
        powerDetails: true,
        tariffs: false,
        limits: {
          pageSize: { min: 10, max: 9_999 },
          statusUpdatedWithinMinutes: { min: 1, max: 10 },
          radiusMetersMax: null,
        },
      })
    })
  })

  describe('fetchInfoPage', () => {
    const infoSuccessXml = loadFixture('info-success.xml')

    it('전국 범위 조회 시 API service에 nationwide 파라미터를 전달하고 fixture 데이터를 ChargerInfoPage로 매핑한다', async () => {
      apiService.getChargerInfo.mockResolvedValue(infoSuccessXml)

      const query: ChargerInfoQuery = {
        scope: { type: 'NATIONWIDE', countryCode: 'KR' },
        pagination: { type: 'PAGE', page: 1, pageSize: 32 },
      }

      const result = await service.fetchInfoPage(query)

      expect(apiService.getChargerInfo).toHaveBeenCalledTimes(1)
      expect(apiService.getChargerInfo).toHaveBeenCalledWith({
        pageNo: 1,
        numOfRows: 32,
        nationwide: true,
      })

      const validated = ChargerInfoPageSchema.parse(result)
      expect(validated.providerId).toBe('keco')
      expect(validated.page).toBe(1)
      expect(validated.pageSize).toBe(9999)
      expect(validated.totalCount).toBe(1)
      expect(validated.nextCursor).toBeNull()
      expect(validated.hasNext).toBe(false)
      expect(typeof validated.observedAt).toBe('string')
      expect(validated.providerMetadata).toEqual({
        resultCode: '00',
        resultMsg: 'OK',
      })

      expect(validated.items).toHaveLength(1)
      expect(validated.items[0]).toEqual({
        providerId: 'keco',
        operatorId: 'ME',
        operatorName: '환경부',
        stationId: '28260005',
        chargerId: '01',
        name: '환경부 종합청사 충전소',
        address: '인천광역시 서구 환경로 42',
        addressDetail: null,
        location: {
          lat: 37.5665,
          lng: 126.978,
        },
        access: 'UNKNOWN',
        operatingHours: '24시간 이용가능',
        connectors: [
          {
            type: 'KECO:01',
            maxPowerKw: 50,
            count: 1,
          },
        ],
      })
    })

    it('지역 범위 및 하위 지역 코드 조회 시 API service에 zcode와 zscode를 전달한다', async () => {
      apiService.getChargerInfo.mockResolvedValue(infoSuccessXml)

      const query: ChargerInfoQuery = {
        scope: {
          type: 'REGION',
          countryCode: 'KR',
          regionCode: '11',
          subregionCode: '11110',
        },
        pagination: { type: 'PAGE', page: 2, pageSize: 64 },
      }

      const result = await service.fetchInfoPage(query)

      expect(apiService.getChargerInfo).toHaveBeenCalledWith({
        pageNo: 2,
        numOfRows: 64,
        zcode: '11',
        zscode: '11110',
      })
      expect(result.items).toHaveLength(1)
    })

    it('limitYn, connector 누락, 위치 좌표 경계값 등 상세 속성을 올바르게 정규화한다', async () => {
      const customXml = `
        <response>
          <header>
            <resultCode>00</resultCode>
            <resultMsg>OK</resultMsg>
          </header>
          <body>
            <items>
              <item>
                <busiId>KP</busiId>
                <bnm>한국전력</bnm>
                <statId>KP0001</statId>
                <chgerId>01</chgerId>
                <statNm>한전 본사</statNm>
                <address>전라남도 나주시 전력로 55</address>
                <detail>지상 주차장</detail>
                <lat>35.025</lat>
                <lng>126.783</lng>
                <limitYn>Y</limitYn>
                <useTime>09:00~18:00</useTime>
                <chgerType>06</chgerType>
                <output>100</output>
              </item>
              <item>
                <busiId>PI</busiId>
                <statId>PI0001</statId>
                <chgerId>01</chgerId>
                <statNm>공용 충전소</statNm>
                <addr>서울특별시 중구 세종대로 110</addr>
                <location>지하 1층</location>
                <lat>999.0</lat>
                <lng>126.978</lng>
                <limitYn>N</limitYn>
              </item>
            </items>
            <numOfRows>10</numOfRows>
            <pageNo>1</pageNo>
            <totalCount>2</totalCount>
          </body>
        </response>
      `
      apiService.getChargerInfo.mockResolvedValue(customXml)

      const result = await service.fetchInfoPage({
        scope: { type: 'NATIONWIDE', countryCode: 'KR' },
        pagination: { type: 'PAGE', page: 1, pageSize: 10 },
      })

      expect(result.items).toHaveLength(2)

      // First item: RESTRICTED access, fallback bnm -> operatorName, detail -> addressDetail, KECO:06 connector
      expect(result.items[0]).toMatchObject({
        operatorId: 'KP',
        operatorName: '한국전력',
        stationId: 'KP0001',
        chargerId: '01',
        address: '전라남도 나주시 전력로 55',
        addressDetail: '지상 주차장',
        location: { lat: 35.025, lng: 126.783 },
        access: 'RESTRICTED',
        connectors: [{ type: 'KECO:06', maxPowerKw: 100, count: 1 }],
      })

      // Second item: PUBLIC access, invalid lat -> location null, no chgerType -> empty connectors
      expect(result.items[1]).toMatchObject({
        operatorId: 'PI',
        operatorName: null,
        stationId: 'PI0001',
        chargerId: '01',
        address: '서울특별시 중구 세종대로 110',
        addressDetail: '지하 1층',
        location: null,
        access: 'PUBLIC',
        connectors: [],
      })
    })

    it('상위 API service 실패 시 발생한 예외를 전파하고 telemetry 실패를 기록한다', async () => {
      const upstreamError = new KecoUpstreamProviderException('Upstream timeout', {
        failureKind: 'TIMEOUT',
        retryable: true,
      })
      apiService.getChargerInfo.mockRejectedValue(upstreamError)

      const telemetrySpy = jest.spyOn(telemetry, 'record')

      await expect(
        service.fetchInfoPage({
          scope: { type: 'NATIONWIDE', countryCode: 'KR' },
          pagination: { type: 'PAGE', page: 1, pageSize: 32 },
        }),
      ).rejects.toBe(upstreamError)

      expect(telemetrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'keco',
          endpoint: '/getChargerInfo',
          quotaState: 'ERROR',
        }),
      )
    })
  })

  describe('fetchStatusPage', () => {
    const statusSuccessXml = loadFixture('status-success.xml')
    const statusEmptyXml = loadFixture('status-empty.xml')
    const statusNodataXml = loadFixture('status-nodata.xml')

    it('전국 범위 및 변경 시간 조회 시 API service에 period를 전달하고 fixture 데이터를 ChargerStatusPage로 매핑한다', async () => {
      apiService.getChargerStatus.mockResolvedValue(statusSuccessXml)

      const query: ChargerStatusQuery = {
        scope: { type: 'NATIONWIDE', countryCode: 'KR' },
        pagination: { type: 'PAGE', page: 1, pageSize: 32 },
        updatedWithinMinutes: 5,
      }

      const result = await service.fetchStatusPage(query)

      expect(apiService.getChargerStatus).toHaveBeenCalledTimes(1)
      expect(apiService.getChargerStatus).toHaveBeenCalledWith({
        pageNo: 1,
        numOfRows: 32,
        nationwide: true,
        period: 5,
      })

      const validated = ChargerStatusPageSchema.parse(result)
      expect(validated.providerId).toBe('keco')
      expect(validated.page).toBe(1)
      expect(validated.pageSize).toBe(9999)
      expect(validated.totalCount).toBe(2)
      expect(validated.nextCursor).toBeNull()
      expect(validated.hasNext).toBe(false)
      expect(typeof validated.observedAt).toBe('string')
      expect(validated.providerMetadata).toEqual({
        resultCode: '00',
        resultMsg: 'OK',
      })

      expect(validated.items).toHaveLength(2)

      // Item 0: stat 2 -> AVAILABLE
      expect(validated.items[0]).toEqual({
        providerId: 'keco',
        operatorId: 'ME',
        stationId: '28260005',
        chargerId: '01',
        status: 'AVAILABLE',
        rawStatus: '2',
        statusUpdatedAt: '2019-08-29T03:10:20.000Z',
        observedAt: validated.observedAt,
        availableCount: 1,
        outOfServiceCount: 0,
        totalCount: 1,
      })

      // Item 1: stat 3 -> CHARGING
      expect(validated.items[1]).toEqual({
        providerId: 'keco',
        operatorId: 'ME',
        stationId: '28260005',
        chargerId: '02',
        status: 'CHARGING',
        rawStatus: '3',
        statusUpdatedAt: '2019-08-29T03:15:00.000Z',
        observedAt: validated.observedAt,
        availableCount: 0,
        outOfServiceCount: 0,
        totalCount: 1,
      })
    })

    it('상태 코드(1, 4, 5, 기타) 및 일시 형식을 올바르게 정규화한다', async () => {
      const customXml = `
        <response>
          <header>
            <resultCode>00</resultCode>
            <resultMsg>OK</resultMsg>
          </header>
          <body>
            <items>
              <item>
                <busiId>ME</busiId>
                <statId>STAT01</statId>
                <chgerId>01</chgerId>
                <stat>1</stat>
                <statUpdDt>20230501140000</statUpdDt>
              </item>
              <item>
                <busiId>ME</busiId>
                <statId>STAT01</statId>
                <chgerId>02</chgerId>
                <stat>4</stat>
                <statUpdDt>invalid-date</statUpdDt>
              </item>
              <item>
                <busiId>ME</busiId>
                <statId>STAT01</statId>
                <chgerId>03</chgerId>
                <stat>5</stat>
                <statUpdDt></statUpdDt>
              </item>
              <item>
                <busiId>ME</busiId>
                <statId>STAT01</statId>
                <chgerId>04</chgerId>
                <stat>9</stat>
              </item>
              <item>
                <busiId>ME</busiId>
                <statId>STAT01</statId>
                <chgerId>05</chgerId>
                <stat>2</stat>
                <statUpdDt>20230230010000</statUpdDt>
              </item>
            </items>
            <numOfRows>10</numOfRows>
            <pageNo>1</pageNo>
            <totalCount>5</totalCount>
          </body>
        </response>
      `
      apiService.getChargerStatus.mockResolvedValue(customXml)

      const result = await service.fetchStatusPage({
        scope: { type: 'NATIONWIDE', countryCode: 'KR' },
        pagination: { type: 'PAGE', page: 1, pageSize: 10 },
      })

      expect(result.items).toHaveLength(5)

      // stat: 1 -> OUT_OF_SERVICE
      expect(result.items[0]).toMatchObject({
        status: 'OUT_OF_SERVICE',
        rawStatus: '1',
        statusUpdatedAt: '2023-05-01T05:00:00.000Z',
        availableCount: 0,
        outOfServiceCount: 1,
        totalCount: 1,
      })

      // stat: 4 -> OUT_OF_SERVICE, invalid date -> null
      expect(result.items[1]).toMatchObject({
        status: 'OUT_OF_SERVICE',
        rawStatus: '4',
        statusUpdatedAt: null,
        availableCount: 0,
        outOfServiceCount: 1,
        totalCount: 1,
      })

      // stat: 5 -> MAINTENANCE
      expect(result.items[2]).toMatchObject({
        status: 'MAINTENANCE',
        rawStatus: '5',
        statusUpdatedAt: null,
        availableCount: 0,
        outOfServiceCount: 1,
        totalCount: 1,
      })

      // stat: 9 -> UNKNOWN
      expect(result.items[3]).toMatchObject({
        status: 'UNKNOWN',
        rawStatus: '9',
        statusUpdatedAt: null,
        availableCount: null,
        outOfServiceCount: null,
        totalCount: 1,
      })

      // 실제 달력에 없는 날짜는 자동 보정하지 않고 거부한다.
      expect(result.items[4]).toMatchObject({
        status: 'AVAILABLE',
        statusUpdatedAt: null,
      })
    })

    it('빈 목록 fixture(status-empty.xml, status-nodata.xml)를 빈 items 배열로 안전하게 처리한다', async () => {
      apiService.getChargerStatus.mockResolvedValueOnce(statusEmptyXml)

      const emptyResult = await service.fetchStatusPage({
        scope: { type: 'NATIONWIDE', countryCode: 'KR' },
        pagination: { type: 'PAGE', page: 1, pageSize: 32 },
      })

      expect(emptyResult.items).toEqual([])
      expect(emptyResult.totalCount).toBe(0)
      expect(emptyResult.hasNext).toBe(false)

      apiService.getChargerStatus.mockResolvedValueOnce(statusNodataXml)

      const nodataResult = await service.fetchStatusPage({
        scope: { type: 'NATIONWIDE', countryCode: 'KR' },
        pagination: { type: 'PAGE', page: 1, pageSize: 32 },
      })

      expect(nodataResult.items).toEqual([])
      expect(nodataResult.totalCount).toBe(0)
      expect(nodataResult.providerMetadata).toEqual({
        resultCode: '03',
        resultMsg: 'NODATA_ERROR',
      })
    })
  })

  describe('pagination & hasNext calculation', () => {
    it.each([
      { pageNo: 1, numOfRows: 10, totalCount: 25, expectedHasNext: true },
      { pageNo: 2, numOfRows: 10, totalCount: 25, expectedHasNext: true },
      { pageNo: 3, numOfRows: 10, totalCount: 25, expectedHasNext: false },
      { pageNo: 1, numOfRows: 25, totalCount: 25, expectedHasNext: false },
      { pageNo: 1, numOfRows: 50, totalCount: 25, expectedHasNext: false },
    ])(
      'pageNo=$pageNo, numOfRows=$numOfRows, totalCount=$totalCount 조건에서 hasNext=$expectedHasNext로 계산된다',
      async ({ pageNo, numOfRows, totalCount, expectedHasNext }) => {
        const pagedXml = `
          <response>
            <header>
              <resultCode>00</resultCode>
              <resultMsg>OK</resultMsg>
            </header>
            <body>
              <items/>
              <numOfRows>${numOfRows}</numOfRows>
              <pageNo>${pageNo}</pageNo>
              <totalCount>${totalCount}</totalCount>
            </body>
          </response>
        `
        apiService.getChargerInfo.mockResolvedValue(pagedXml)

        const result = await service.fetchInfoPage({
          scope: { type: 'NATIONWIDE', countryCode: 'KR' },
          pagination: { type: 'PAGE', page: pageNo, pageSize: numOfRows },
        })

        expect(result.page).toBe(pageNo)
        expect(result.pageSize).toBe(numOfRows)
        expect(result.totalCount).toBe(totalCount)
        expect(result.hasNext).toBe(expectedHasNext)
        expect(result.nextCursor).toBeNull()
      },
    )
  })

  describe('rejection of invalid scopes and cursor pagination', () => {
    it('CURSOR 기반 pagination 요청을 내부 오류(INVALID_REQUEST)로 거부한다', async () => {
      const cursorQuery = {
        scope: { type: 'NATIONWIDE', countryCode: 'KR' },
        pagination: { type: 'CURSOR', cursor: 'cursor-token', pageSize: 32 },
      } as unknown as ChargerInfoQuery

      await expect(service.fetchInfoPage(cursorQuery)).rejects.toMatchObject({
        origin: 'INTERNAL',
        failureKind: 'INVALID_REQUEST',
      })
      expect(apiService.getChargerInfo).not.toHaveBeenCalled()

      const statusCursorQuery = {
        scope: { type: 'NATIONWIDE', countryCode: 'KR' },
        pagination: { type: 'CURSOR', pageSize: 32 },
      } as unknown as ChargerStatusQuery

      await expect(service.fetchStatusPage(statusCursorQuery)).rejects.toMatchObject({
        origin: 'INTERNAL',
        failureKind: 'INVALID_REQUEST',
      })
      expect(apiService.getChargerStatus).not.toHaveBeenCalled()
    })

    it.each(['US', 'JP', 'GB'])('한국(KR)이 아닌 국가 코드(%s)를 내부 오류로 거부한다', async (countryCode) => {
      const nationwideQuery = {
        scope: { type: 'NATIONWIDE', countryCode },
        pagination: { type: 'PAGE', page: 1, pageSize: 32 },
      } as unknown as ChargerInfoQuery

      await expect(service.fetchInfoPage(nationwideQuery)).rejects.toMatchObject({
        origin: 'INTERNAL',
        failureKind: 'INVALID_REQUEST',
      })

      const regionQuery = {
        scope: { type: 'REGION', countryCode, regionCode: '11' },
        pagination: { type: 'PAGE', page: 1, pageSize: 32 },
      } as unknown as ChargerInfoQuery

      await expect(service.fetchInfoPage(regionQuery)).rejects.toMatchObject({
        origin: 'INTERNAL',
        failureKind: 'INVALID_REQUEST',
      })
    })

    it.each([
      {
        name: 'BOUNDS',
        scope: {
          type: 'BOUNDS',
          southWest: { lat: 37.0, lng: 126.0 },
          northEast: { lat: 38.0, lng: 127.0 },
        },
      },
      {
        name: 'RADIUS',
        scope: {
          type: 'RADIUS',
          center: { lat: 37.5, lng: 127.0 },
          radiusMeters: 5000,
        },
      },
      {
        name: 'STATIONS',
        scope: {
          type: 'STATIONS',
          stationIds: ['28260005'],
        },
      },
    ])('지원하지 않는 scope($name)를 내부 오류로 거부한다', async ({ scope }) => {
      const unsupportedQuery = {
        scope,
        pagination: { type: 'PAGE', page: 1, pageSize: 32 },
      } as unknown as ChargerInfoQuery

      await expect(service.fetchInfoPage(unsupportedQuery)).rejects.toMatchObject({
        origin: 'INTERNAL',
        failureKind: 'INVALID_REQUEST',
      })
      expect(apiService.getChargerInfo).not.toHaveBeenCalled()
    })

    it.each([
      {
        name: '유효하지 않은 page 번호 (0)',
        query: {
          scope: { type: 'NATIONWIDE', countryCode: 'KR' },
          pagination: { type: 'PAGE', page: 0, pageSize: 32 },
        },
      },
      {
        name: '빈 regionCode',
        query: {
          scope: { type: 'REGION', countryCode: 'KR', regionCode: '' },
          pagination: { type: 'PAGE', page: 1, pageSize: 32 },
        },
      },
      {
        name: '알 수 없는 scope type',
        query: {
          scope: { type: 'UNKNOWN_SCOPE', countryCode: 'KR' },
          pagination: { type: 'PAGE', page: 1, pageSize: 32 },
        },
      },
    ])('스키마에 맞지 않는 쿼리 ($name)를 거부한다', async ({ query }) => {
      const invalidQuery = query as unknown as ChargerInfoQuery

      await expect(service.fetchInfoPage(invalidQuery)).rejects.toBeInstanceOf(KecoInternalException)
      expect(apiService.getChargerInfo).not.toHaveBeenCalled()
    })
  })
})
