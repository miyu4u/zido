import { KECO_REQUEST_BOUNDS } from './keco-contracts'
import type { ChargerInfoQuery, ChargerStatusQuery } from './keco-contracts'
import { KecoProviderError } from './keco-errors'

export interface ValidatedStatusQuery {
  pageNo: number
  numOfRows: number
  period: number
  zcode?: string
}

export interface ValidatedInfoQuery {
  pageNo: number
  numOfRows: number
  zcode?: string
}

/**
 * Validates and normalizes KECO getChargerStatus query parameters.
 */
export function validateChargerStatusQuery(query?: ChargerStatusQuery): ValidatedStatusQuery {
  const pageNo = query?.pageNo ?? KECO_REQUEST_BOUNDS.PAGE_NO_MIN
  if (!Number.isSafeInteger(pageNo) || pageNo < KECO_REQUEST_BOUNDS.PAGE_NO_MIN) {
    throw new KecoProviderError(
      `Invalid pageNo: ${pageNo}. Must be an integer >= ${KECO_REQUEST_BOUNDS.PAGE_NO_MIN}.`,
      { failureKind: 'INVALID_REQUEST', retryable: false }
    )
  }

  const numOfRows = query?.numOfRows ?? KECO_REQUEST_BOUNDS.DEFAULT_NUM_OF_ROWS
  if (
    !Number.isSafeInteger(numOfRows) ||
    numOfRows < KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN ||
    numOfRows > KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX
  ) {
    throw new KecoProviderError(
      `Invalid numOfRows: ${numOfRows}. Must be an integer between ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN} and ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX}.`,
      { failureKind: 'INVALID_REQUEST', retryable: false }
    )
  }

  const period = query?.period ?? KECO_REQUEST_BOUNDS.DEFAULT_PERIOD
  if (
    !Number.isSafeInteger(period) ||
    period < KECO_REQUEST_BOUNDS.PERIOD_MIN ||
    period > KECO_REQUEST_BOUNDS.PERIOD_MAX
  ) {
    throw new KecoProviderError(
      `Invalid period: ${period}. Must be an integer between ${KECO_REQUEST_BOUNDS.PERIOD_MIN} and ${KECO_REQUEST_BOUNDS.PERIOD_MAX}.`,
      { failureKind: 'INVALID_REQUEST', retryable: false }
    )
  }

  let zcode: string | undefined
  if (query?.zcode !== undefined && query?.zcode !== null && query.zcode !== '') {
    const trimmedZcode = String(query.zcode).trim()
    if (!/^\d{2}$/.test(trimmedZcode)) {
      throw new KecoProviderError(
        `Invalid zcode: "${query.zcode}". Must be a 2-digit numeric string (e.g. "11", "28").`,
        { failureKind: 'INVALID_REQUEST', retryable: false }
      )
    }
    zcode = trimmedZcode
  }

  return { pageNo, numOfRows, period, zcode }
}

/**
 * Validates and normalizes KECO getChargerInfo query parameters.
 */
export function validateChargerInfoQuery(query?: ChargerInfoQuery): ValidatedInfoQuery {
  const pageNo = query?.pageNo ?? KECO_REQUEST_BOUNDS.PAGE_NO_MIN
  if (!Number.isSafeInteger(pageNo) || pageNo < KECO_REQUEST_BOUNDS.PAGE_NO_MIN) {
    throw new KecoProviderError(
      `Invalid pageNo: ${pageNo}. Must be an integer >= ${KECO_REQUEST_BOUNDS.PAGE_NO_MIN}.`,
      { failureKind: 'INVALID_REQUEST', retryable: false }
    )
  }

  const numOfRows = query?.numOfRows ?? KECO_REQUEST_BOUNDS.DEFAULT_NUM_OF_ROWS
  if (
    !Number.isSafeInteger(numOfRows) ||
    numOfRows < KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN ||
    numOfRows > KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX
  ) {
    throw new KecoProviderError(
      `Invalid numOfRows: ${numOfRows}. Must be an integer between ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MIN} and ${KECO_REQUEST_BOUNDS.NUM_OF_ROWS_MAX}.`,
      { failureKind: 'INVALID_REQUEST', retryable: false }
    )
  }

  let zcode: string | undefined
  if (query?.zcode !== undefined && query?.zcode !== null && query.zcode !== '') {
    const trimmedZcode = String(query.zcode).trim()
    if (!/^\d{2}$/.test(trimmedZcode)) {
      throw new KecoProviderError(
        `Invalid zcode: "${query.zcode}". Must be a 2-digit numeric string (e.g. "11", "28").`,
        { failureKind: 'INVALID_REQUEST', retryable: false }
      )
    }
    zcode = trimmedZcode
  }

  return { pageNo, numOfRows, zcode }
}

/**
 * Builds full request URL for getChargerStatus.
 */
export function buildStatusUrl(
  endpoint: string,
  serviceKey: string,
  query: ValidatedStatusQuery
): string {
  const base = endpoint.replace(/\/+$/, '')
  const url = new URL(`${base}/getChargerStatus`)
  url.searchParams.set('serviceKey', serviceKey)
  url.searchParams.set('pageNo', String(query.pageNo))
  url.searchParams.set('numOfRows', String(query.numOfRows))
  url.searchParams.set('period', String(query.period))
  if (query.zcode) {
    url.searchParams.set('zcode', query.zcode)
  }
  return url.toString()
}

/**
 * Builds full request URL for getChargerInfo.
 */
export function buildInfoUrl(
  endpoint: string,
  serviceKey: string,
  query: ValidatedInfoQuery
): string {
  const base = endpoint.replace(/\/+$/, '')
  const url = new URL(`${base}/getChargerInfo`)
  url.searchParams.set('serviceKey', serviceKey)
  url.searchParams.set('pageNo', String(query.pageNo))
  url.searchParams.set('numOfRows', String(query.numOfRows))
  if (query.zcode) {
    url.searchParams.set('zcode', query.zcode)
  }
  return url.toString()
}
