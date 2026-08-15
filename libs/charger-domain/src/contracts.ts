/**
 * Canonical domain contracts for EV Charging Domain (T-01)
 */

export type ChargerSource = 'keco' | 'ksga' | 'other' | string

export type Freshness = 'FRESH' | 'STALE' | 'UNKNOWN'

export type MappedChargerStatus =
  | 'AVAILABLE'
  | 'CHARGING'
  | 'UNAVAILABLE'
  | 'MAINTENANCE'
  | 'UNKNOWN'
  | null

export type EffectiveChargerStatus = Exclude<MappedChargerStatus, null>

export interface ChargerStatusRecord {
  source: ChargerSource
  operatorId: string | null
  stationId: string
  chargerId: string
  rawStatus: string | null
  normalizedStatus: MappedChargerStatus
  status: EffectiveChargerStatus
  statusUpdatedAt: string | null
  observedAt: string
  freshness: Freshness
  sourceVersion: string | null
}

export interface ChargerStationRecord {
  source: ChargerSource
  operatorId: string | null
  stationId: string
  name: string | null
  address: string | null
  location: { lat: number; lng: number } | null
  access: 'PUBLIC' | 'RESTRICTED' | 'UNKNOWN'
  chargers: ChargerStatusRecord[]
  sourceObservedAt: string
  sourceVersion: string | null
}
