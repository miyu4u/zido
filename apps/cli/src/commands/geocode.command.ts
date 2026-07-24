import { z } from 'zod'
import type { GeoGeocodeOutput, PlaceService } from 'zido/place-domain'

/**
 * geocode command가 빈 주소를 provider 계층으로 넘기지 않도록 검증한다.
 */
export const GeocodeCommandInputSchema = z.object({
  address: z.string().trim().min(1),
})

export type GeocodeCommandInput = z.infer<typeof GeocodeCommandInputSchema>

/**
 * 주소를 좌표 domain 결과로 바꾸며 MCP response content를 만들지 않는다.
 */
export async function executeGeocodeCommand(
  service: PlaceService,
  input: GeocodeCommandInput,
): Promise<GeoGeocodeOutput | null> {
  return service.geocode(input)
}
