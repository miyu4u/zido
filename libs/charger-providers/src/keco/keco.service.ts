import { Injectable } from '@nestjs/common'
import type {
  ChargerInfoQuery,
  ChargerStatusQuery,
  IKecoProvider,
  KecoInfoItem,
  KecoServiceOptions,
  KecoStatusItem,
  KecoTelemetryRecorder,
  ProviderPage,
} from './types'
import { KecoAPIService } from './keco-api.service'
import { KecoProviderError } from './keco.exception'
import { validateChargerInfoQuery, validateChargerStatusQuery } from './keco-query'
import { KecoXmlParser } from './keco-xml-parser'

/**
 * KECO 전기차 충전소/충전기 비즈니스 서비스 인터페이스.
 * IKecoProvider 계약을 충족하며 쿼리 검증, XML 파싱, 텔레메트리 연동을 제공한다.
 */
export interface IKecoService extends IKecoProvider {
  /**
   * 충전기 실시간 상태 페이지를 조회한다.
   *
   * @param query 상태 조회 파라미터 (선택 사항)
   * @returns 파싱 및 검증된 충전기 상태 페이지 객체
   */
  fetchStatusPage(query?: ChargerStatusQuery): Promise<ProviderPage<KecoStatusItem>>

  /**
   * 충전소/충전기 기본 정보 페이지를 조회한다.
   *
   * @param query 정보 조회 파라미터 (선택 사항)
   * @returns 파싱 및 검증된 충전소 기본 정보 페이지 객체
   */
  fetchInfoPage(query?: ChargerInfoQuery): Promise<ProviderPage<KecoInfoItem>>
}

/**
 * KECO 전기차 충전소/충전기 비즈니스 서비스.
 * 쿼리 Zod 파싱 검증, XML 파싱, 응답 결과 매핑, 페이지 구성, 텔레메트리 수집 책임을 소유한다.
 */
@Injectable()
export class KecoService implements IKecoService, IKecoProvider {
  private readonly parser: KecoXmlParser
  private readonly telemetry?: KecoTelemetryRecorder

  constructor(
    private readonly apiService: KecoAPIService,
    options?: KecoServiceOptions,
  ) {
    this.parser = new KecoXmlParser()
    this.telemetry = options?.telemetry
  }

  /**
   * KECO getChargerStatus API로부터 충전기 실시간 상태 페이지를 조회한다.
   *
   * @param query 상태 조회 조건 파라미터
   * @returns 충전기 상태 페이지 객체
   */
  public async fetchStatusPage(query?: ChargerStatusQuery): Promise<ProviderPage<KecoStatusItem>> {
    const validated = validateChargerStatusQuery(query)
    const startedAt = Date.now()

    try {
      const xml = await this.apiService.getChargerStatus(validated)
      const page = this.parser.parseStatusPage(xml)
      this.telemetry?.record({
        provider: 'keco',
        endpoint: '/getChargerStatus',
        resultCode: page.resultCode,
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
        itemCount: page.items.length,
        retryCount: 0,
        quotaState: page.resultCode === '22' ? 'EXHAUSTED' : page.resultCode === '23' ? 'RATE_LIMITED' : 'OK',
      })
      return page
    } catch (error) {
      this.recordErrorTelemetry('/getChargerStatus', error, startedAt)
      throw error
    }
  }

  /**
   * KECO getChargerInfo API로부터 충전소/충전기 기본 정보 페이지를 조회한다.
   *
   * @param query 정보 조회 조건 파라미터
   * @returns 충전소 기본 정보 페이지 객체
   */
  public async fetchInfoPage(query?: ChargerInfoQuery): Promise<ProviderPage<KecoInfoItem>> {
    const validated = validateChargerInfoQuery(query)
    const startedAt = Date.now()

    try {
      const xml = await this.apiService.getChargerInfo(validated)
      const page = this.parser.parseInfoPage(xml)
      this.telemetry?.record({
        provider: 'keco',
        endpoint: '/getChargerInfo',
        resultCode: page.resultCode,
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
        itemCount: page.items.length,
        retryCount: 0,
        quotaState: page.resultCode === '22' ? 'EXHAUSTED' : page.resultCode === '23' ? 'RATE_LIMITED' : 'OK',
      })
      return page
    } catch (error) {
      this.recordErrorTelemetry('/getChargerInfo', error, startedAt)
      throw error
    }
  }

  /**
   * 오류 발생 시 텔레메트리 이벤트를 기록한다.
   *
   * @param endpoint 요청 엔드포인트 경로
   * @param error 발생한 오류 객체
   * @param startedAt 요청 시작 시각(타임스탬프)
   */
  private recordErrorTelemetry(endpoint: string, error: unknown, startedAt: number): void {
    const httpStatus = error instanceof KecoProviderError ? error.statusCode : undefined
    const resultCode =
      error instanceof KecoProviderError
        ? (error.resultCode ?? (httpStatus ? `HTTP_${httpStatus}` : 'ERROR'))
        : 'ERROR'
    const quotaState =
      error instanceof KecoProviderError
        ? error.failureKind === 'QUOTA_EXHAUSTED'
          ? 'EXHAUSTED'
          : error.failureKind === 'RATE_LIMITED'
            ? 'RATE_LIMITED'
            : 'ERROR'
        : 'ERROR'

    this.telemetry?.record({
      provider: 'keco',
      endpoint,
      resultCode,
      httpStatus,
      latencyMs: Date.now() - startedAt,
      itemCount: 0,
      retryCount: 0,
      quotaState,
    })
  }
}
