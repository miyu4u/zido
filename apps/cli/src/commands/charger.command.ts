import { z } from 'zod'
import { ChargerService, CollectionScopeInputSchema } from 'zido/charger-domain'

/**
 * 충전소 nearby와 scope preview가 공유하는 좌표·범위 입력 계약이다.
 */
const ChargerLocationInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().positive().max(50_000).default(3_000),
  scope: CollectionScopeInputSchema.optional(),
})

/**
 * 실제 charger domain nearby 검색 입력을 검증한다.
 */
export const ChargerNearbyCommandInputSchema = ChargerLocationInputSchema.extend({
  limit: z.number().int().positive().max(100).optional(),
})

/**
 * CLI nearby command의 검증된 입력 타입이다.
 */
export type ChargerNearbyCommandInput = z.infer<typeof ChargerNearbyCommandInputSchema>

/**
 * provider 호출 없는 collection scope preview 입력을 검증한다.
 */
export const ChargerScopeCommandInputSchema = ChargerLocationInputSchema

/**
 * CLI scope preview command의 검증된 입력 타입이다.
 */
export type ChargerScopeCommandInput = z.infer<typeof ChargerScopeCommandInputSchema>

/**
 * 저장된 opaque station/charger 상태 조회 입력을 검증한다.
 */
export const ChargerStatusCommandInputSchema = z.object({
  stationId: z.string().min(1),
  chargerId: z.string().min(1).optional(),
})

/**
 * CLI status command의 검증된 입력 타입이다.
 */
export type ChargerStatusCommandInput = z.infer<typeof ChargerStatusCommandInputSchema>

/**
 * 명시된 collection scope로 실제 충전소 nearby 검색을 실행한다.
 */
export async function executeChargerNearbyCommand(
  service: ChargerService,
  input: ChargerNearbyCommandInput,
) {
  return service.searchNearby(input)
}

/**
 * provider 호출 없이 collection scope와 예상 region 집합을 반환한다.
 */
export async function executeChargerScopeCommand(
  service: ChargerService,
  input: ChargerScopeCommandInput,
) {
  return service.previewScope(input)
}

/**
 * local snapshot에서 opaque 충전소 상태만 읽는다.
 */
export async function executeChargerStatusCommand(
  service: ChargerService,
  input: ChargerStatusCommandInput,
) {
  return service.getStatus(input.stationId, input.chargerId)
}
