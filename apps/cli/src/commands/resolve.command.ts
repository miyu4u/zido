import { z } from 'zod'
import type { PlaceResolveOutput, PlaceService } from 'zido/place-domain'

/**
 * resolve command가 domain service에 전달할 입력을 검증한다.
 */
export const ResolveCommandInputSchema = z.object({
  query: z.string().trim().min(1),
})

export type ResolveCommandInput = z.infer<typeof ResolveCommandInputSchema>

/**
 * 검색어를 장소 domain 결과로 변환하며 MCP envelope는 추가하지 않는다.
 */
export async function executeResolveCommand(
  service: PlaceService,
  input: ResolveCommandInput,
): Promise<PlaceResolveOutput | null> {
  return service.resolve(input)
}
