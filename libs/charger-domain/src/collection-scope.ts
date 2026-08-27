import { z } from 'zod'
import { KECO_REGION_CODES } from 'zido/common'

const KECO_REGION_CODE_SET = new Set<string>(KECO_REGION_CODES)
const KecoRegionCodeSchema = z
  .string()
  .refine((value) => KECO_REGION_CODE_SET.has(value), 'regionCode must be a supported KECO zcode')

/**
 * 수집 범위 모드 스키마.
 * - AUTO: 좌표/반경 기반 자동 행정구역 판정
 * - REGIONS: 사용자가 지정한 2자리 시·도 코드 목록 수집
 * - NATIONWIDE: 전국 단위 수집 (운영 설정 + 명시적 승인 이중 게이트 필요)
 */
export const CollectionScopeModeSchema = z.enum(['AUTO', 'REGIONS', 'NATIONWIDE'])
export type CollectionScopeMode = z.infer<typeof CollectionScopeModeSchema>

/**
 * 수집 영역 완성도 스키마.
 * - COMPLETE: 요청 반경/영역이 온전히 수집 범위에 포함됨이 증명됨
 * - PARTIAL: 요청 영역의 일부만 수집 범위에 포함됨 (예: 경계 교차 중 일부만 선택)
 * - UNRESOLVED: 경계 미지원, 데이터 불완전 또는 불확실성으로 인해 영역을 특정할 수 없음
 */
export const CollectionCoverageSchema = z.enum(['COMPLETE', 'PARTIAL', 'UNRESOLVED'])
export type CollectionCoverage = z.infer<typeof CollectionCoverageSchema>

/**
 * 수집 범위 입력 요청 스키마.
 */
export const CollectionScopeInputSchema = z
  .object({
    mode: CollectionScopeModeSchema.default('AUTO'),
    regionCodes: z
      .array(KecoRegionCodeSchema)
      .optional(),
    acknowledgeNationwide: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const mode = data.mode ?? 'AUTO'
    switch (mode) {
      case 'AUTO': {
        if (data.regionCodes && data.regionCodes.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'AUTO mode must not specify regionCodes',
            path: ['regionCodes'],
          })
        }
        if (data.acknowledgeNationwide !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'AUTO mode must not specify acknowledgeNationwide',
            path: ['acknowledgeNationwide'],
          })
        }
        break
      }
      case 'REGIONS': {
        if (!data.regionCodes || data.regionCodes.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'REGIONS mode requires at least one regionCode',
            path: ['regionCodes'],
          })
        }
        if (data.acknowledgeNationwide !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'REGIONS mode must not specify acknowledgeNationwide',
            path: ['acknowledgeNationwide'],
          })
        }
        break
      }
      case 'NATIONWIDE': {
        if (data.acknowledgeNationwide !== true) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'NATIONWIDE mode requires acknowledgeNationwide: true',
            path: ['acknowledgeNationwide'],
          })
        }
        if (data.regionCodes && data.regionCodes.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'NATIONWIDE mode must not specify regionCodes',
            path: ['regionCodes'],
          })
        }
        break
      }
    }
  })

export type CollectionScopeInput = z.infer<typeof CollectionScopeInputSchema>

/**
 * 수집 경계 데이터 출처 및 버전 메타데이터 스키마.
 */
export const CollectionScopeProvenanceSchema = z.object({
  version: z.string(),
  source: z.string(),
  effectiveDate: z.string(),
})
export type CollectionScopeProvenance = z.infer<typeof CollectionScopeProvenanceSchema>

/**
 * 수집 범위 결과 메타데이터 스키마.
 */
export const CollectionScopeMetadataSchema = z.object({
  mode: CollectionScopeModeSchema,
  coverage: CollectionCoverageSchema,
  regionCodes: z.array(KecoRegionCodeSchema),
  scopeSource: CollectionScopeModeSchema,
  collectionTriggered: z.boolean(),
  provenance: CollectionScopeProvenanceSchema,
  candidateRegions: z.array(z.string()).optional(),
  unresolvedReason: z.string().optional(),
}).superRefine((data, ctx) => {
  const validCoverage =
    (data.mode === 'AUTO' && (data.coverage === 'COMPLETE' || data.coverage === 'UNRESOLVED')) ||
    (data.mode === 'REGIONS' && (data.coverage === 'COMPLETE' || data.coverage === 'PARTIAL')) ||
    (data.mode === 'NATIONWIDE' && data.coverage === 'COMPLETE')
  if (!validCoverage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${data.mode} mode does not support ${data.coverage} coverage`,
      path: ['coverage'],
    })
  }
  if (data.scopeSource !== data.mode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'scopeSource must match mode',
      path: ['scopeSource'],
    })
  }
  const normalizedRegionCodes = Array.from(new Set(data.regionCodes)).sort()
  if (
    normalizedRegionCodes.length !== data.regionCodes.length ||
    normalizedRegionCodes.some((code, index) => code !== data.regionCodes[index])
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'regionCodes must be a sorted unique KECO zcode set',
      path: ['regionCodes'],
    })
  }
  const requiresRegions = data.mode !== 'NATIONWIDE' && data.coverage !== 'UNRESOLVED'
  if (requiresRegions && data.regionCodes.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${data.mode} ${data.coverage} scope requires regionCodes`,
      path: ['regionCodes'],
    })
  }
  if (!requiresRegions && data.regionCodes.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${data.mode} ${data.coverage} scope must not include regionCodes`,
      path: ['regionCodes'],
    })
  }
})
export type CollectionScopeMetadata = z.infer<typeof CollectionScopeMetadataSchema>

/**
 * 좌표 및 반경 기반 행정구역 판정 입력 인터페이스.
 */
export interface RegionScopeResolveInput {
  lat: number
  lng: number
  radiusM: number
}

/**
 * 좌표 및 반경 기반 행정구역 판정 결과 인터페이스.
 */
export interface RegionScopeResolveResult {
  coverage: CollectionCoverage
  regionCodes: string[]
  provenance: CollectionScopeProvenance
  candidateRegions?: string[]
  unresolvedReason?: string
}

/**
 * 수집 영역 판정자 추상 인터페이스.
 */
export interface RegionScopeResolver {
  resolveScope(input: RegionScopeResolveInput): Promise<RegionScopeResolveResult> | RegionScopeResolveResult
}

/**
 * 결정론적 로컬 행정경계 기본 Provenance 상수.
 */
export const DETERMINISTIC_BOUNDARY_PROVENANCE: CollectionScopeProvenance = {
  version: '2026.08',
  source: 'keco-boundary-fixture',
  effectiveDate: '2026-08-01',
} as const

/**
 * 서울 및 서울/경기 경계 검증 fixture 정의.
 */
interface RegionFixture {
  code: string
  name: string
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  /** 경계에 닿지 않는 안전한 내부 영역 */
  innerMinLat?: number
  innerMaxLat?: number
  innerMinLng?: number
  innerMaxLng?: number
}

const SEOUL_FIXTURE: RegionFixture = {
  code: '11',
  name: '서울특별시',
  minLat: 37.428,
  maxLat: 37.701,
  minLng: 126.764,
  maxLng: 127.184,
  innerMinLat: 37.465,
  innerMaxLat: 37.66,
  innerMinLng: 126.83,
  innerMaxLng: 127.13,
}

const GYEONGGI_METRO_FIXTURE: RegionFixture = {
  code: '41',
  name: '경기도(수도권 검증 영역)',
  minLat: 37.15,
  maxLat: 37.95,
  minLng: 126.65,
  maxLng: 127.55,
  innerMinLat: 37.2,
  innerMaxLat: 37.38,
  innerMinLng: 126.9,
  innerMaxLng: 127.3,
}

/**
 * 실제 서울 서부 경계 교차를 검증한 bounded fixture input 범위다.
 */
const SEOUL_GYEONGGI_BOUNDARY_FIXTURE = {
  minLat: 37.54,
  maxLat: 37.56,
  minLng: 126.78,
  maxLng: 126.8,
  minRadiusM: 3_000,
  maxRadiusM: 7_000,
} as const

/**
 * 결정론적 로컬 행정경계 리졸버.
 *
 * 안전하게 검증된 서울 내부 및 서울-경기 경계 fixture만 COMPLETE로 판정하며,
 * 미지원 지역 또는 불완전/경계 초과 좌표는 UNRESOLVED로 fail-closed 처리한다.
 */
export class DeterministicLocalBoundaryResolver implements RegionScopeResolver {
  constructor(
    private readonly provenance: CollectionScopeProvenance = DETERMINISTIC_BOUNDARY_PROVENANCE,
  ) {}

  resolveScope(input: RegionScopeResolveInput): RegionScopeResolveResult {
    const { lat, lng, radiusM } = input

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusM) || radiusM <= 0) {
      return {
        coverage: 'UNRESOLVED',
        regionCodes: [],
        provenance: this.provenance,
        unresolvedReason: 'INVALID_COORDINATES_OR_RADIUS',
      }
    }

    // 반경(m)을 위경도 델타로 근사 계산
    const latDelta = radiusM / 111_000
    const cosLat = Math.cos((lat * Math.PI) / 180)
    const lngDelta = radiusM / (111_000 * (cosLat > 0.01 ? cosLat : 1))

    const queryMinLat = lat - latDelta
    const queryMaxLat = lat + latDelta
    const queryMinLng = lng - lngDelta
    const queryMaxLng = lng + lngDelta

    // 지원 대상 fixture 범위 밖인지 확인 (fail-closed)
    const inTotalSupportedEnvelope =
      queryMinLat >= GYEONGGI_METRO_FIXTURE.minLat &&
      queryMaxLat <= GYEONGGI_METRO_FIXTURE.maxLat &&
      queryMinLng >= GYEONGGI_METRO_FIXTURE.minLng &&
      queryMaxLng <= GYEONGGI_METRO_FIXTURE.maxLng

    if (!inTotalSupportedEnvelope) {
      return {
        coverage: 'UNRESOLVED',
        regionCodes: [],
        provenance: this.provenance,
        unresolvedReason: 'COORDINATES_OUTSIDE_PROVEN_FIXTURE_BOUNDS',
      }
    }

    const centerInSeoul =
      lat >= SEOUL_FIXTURE.minLat &&
      lat <= SEOUL_FIXTURE.maxLat &&
      lng >= SEOUL_FIXTURE.minLng &&
      lng <= SEOUL_FIXTURE.maxLng

    // 원 전체가 서울 안전 내부 영역에 완전히 포함되는지 검사
    const fullyInsideSeoul =
      centerInSeoul &&
      SEOUL_FIXTURE.innerMinLat !== undefined &&
      SEOUL_FIXTURE.innerMaxLat !== undefined &&
      SEOUL_FIXTURE.innerMinLng !== undefined &&
      SEOUL_FIXTURE.innerMaxLng !== undefined &&
      queryMinLat >= SEOUL_FIXTURE.innerMinLat &&
      queryMaxLat <= SEOUL_FIXTURE.innerMaxLat &&
      queryMinLng >= SEOUL_FIXTURE.innerMinLng &&
      queryMaxLng <= SEOUL_FIXTURE.innerMaxLng

    if (fullyInsideSeoul) {
      return {
        coverage: 'COMPLETE',
        regionCodes: ['11'],
        provenance: this.provenance,
      }
    }

    // 서울 경계와 교차하는지 검사
    const intersectsSeoul =
      queryMaxLat >= SEOUL_FIXTURE.minLat &&
      queryMinLat <= SEOUL_FIXTURE.maxLat &&
      queryMaxLng >= SEOUL_FIXTURE.minLng &&
      queryMinLng <= SEOUL_FIXTURE.maxLng

    // 경기 검증 영역과 교차하는지 검사
    const intersectsGyeonggi =
      queryMaxLat >= GYEONGGI_METRO_FIXTURE.minLat &&
      queryMinLat <= GYEONGGI_METRO_FIXTURE.maxLat &&
      queryMaxLng >= GYEONGGI_METRO_FIXTURE.minLng &&
      queryMinLng <= GYEONGGI_METRO_FIXTURE.maxLng

    const intersectingRegions: string[] = []
    if (intersectsSeoul) intersectingRegions.push('11')
    if (intersectsGyeonggi && (!fullyInsideSeoul || !centerInSeoul)) {
      if (!intersectingRegions.includes('41')) {
        intersectingRegions.push('41')
      }
    }

    const inProvenBoundaryFixture =
      lat >= SEOUL_GYEONGGI_BOUNDARY_FIXTURE.minLat &&
      lat <= SEOUL_GYEONGGI_BOUNDARY_FIXTURE.maxLat &&
      lng >= SEOUL_GYEONGGI_BOUNDARY_FIXTURE.minLng &&
      lng <= SEOUL_GYEONGGI_BOUNDARY_FIXTURE.maxLng &&
      radiusM >= SEOUL_GYEONGGI_BOUNDARY_FIXTURE.minRadiusM &&
      radiusM <= SEOUL_GYEONGGI_BOUNDARY_FIXTURE.maxRadiusM

    if (inProvenBoundaryFixture) {
      return {
        coverage: 'COMPLETE',
        regionCodes: ['11', '41'],
        provenance: this.provenance,
      }
    }

    return {
      coverage: 'UNRESOLVED',
      regionCodes: [],
      provenance: this.provenance,
      candidateRegions: Array.from(new Set(intersectingRegions)).sort(),
      unresolvedReason: 'NO_MATCHING_PROVEN_REGION',
    }
  }
}
