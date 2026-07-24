import { z } from 'zod'
import type { PlaceSearchNearbyOutput, PlaceService } from 'zido/place-domain'

/**
 * nearby command의 좌표와 검색 조건을 domain 입력으로 제한한다.
 */
export const NearbyCommandInputSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  keyword: z.string().trim().min(1),
  radiusM: z.number().finite().positive().max(50_000),
})

export type NearbyCommandInput = z.infer<typeof NearbyCommandInputSchema>

/**
 * 중심 좌표 주변 결과를 직접 반환해 CLI 출력 계층이 표현하도록 한다.
 */
export async function executeNearbyCommand(
  service: PlaceService,
  input: NearbyCommandInput,
): Promise<PlaceSearchNearbyOutput> {
  return service.searchNearby({
    center: { lat: input.lat, lng: input.lng },
    keyword: input.keyword,
    radiusM: input.radiusM,
  })
}
