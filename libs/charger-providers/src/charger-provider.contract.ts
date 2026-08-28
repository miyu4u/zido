import { z } from 'zod'

/**
 * Provider 식별자는 저장소 키와 telemetry tag에서 안정적으로 사용되는 값이다.
 */
export const ChargerProviderIdSchema = z.string().trim().min(1)

export type ChargerProviderId = z.infer<typeof ChargerProviderIdSchema>

/**
 * 서로 다른 provider가 지원하는 조회 범위다.
 */
export const ChargerProviderScopeSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('NATIONWIDE'),
        countryCode: z.string().trim().length(2),
    }),
    z.object({
        type: z.literal('REGION'),
        countryCode: z.string().trim().length(2),
        regionCode: z.string().trim().min(1),
        subregionCode: z.string().trim().min(1).optional(),
    }),
    z.object({
        type: z.literal('BOUNDS'),
        southWest: z.object({ lat: z.number(), lng: z.number() }),
        northEast: z.object({ lat: z.number(), lng: z.number() }),
    }),
    z.object({
        type: z.literal('RADIUS'),
        center: z.object({ lat: z.number(), lng: z.number() }),
        radiusMeters: z.number().positive(),
    }),
    z.object({
        type: z.literal('STATIONS'),
        stationIds: z.array(z.string().trim().min(1)).min(1),
    }),
])

export type ChargerProviderScope = z.infer<typeof ChargerProviderScopeSchema>

/**
 * 숫자 page와 cursor 기반 API를 모두 표현하는 pagination 입력이다.
 */
export const ChargerProviderPaginationSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('PAGE'),
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1),
    }),
    z.object({
        type: z.literal('CURSOR'),
        cursor: z.string().min(1).optional(),
        pageSize: z.number().int().min(1),
    }),
])

export type ChargerProviderPagination = z.infer<typeof ChargerProviderPaginationSchema>

/**
 * 충전소·충전기 정적 정보 조회 입력이다.
 */
export const ChargerInfoQuerySchema = z.object({
    scope: ChargerProviderScopeSchema,
    pagination: ChargerProviderPaginationSchema,
})

export type ChargerInfoQuery = z.infer<typeof ChargerInfoQuerySchema>

/**
 * 충전기 상태 조회 입력이다.
 *
 * updatedWithinMinutes는 변경분 API가 상대 시간 범위만 받는 provider를 위한 값이다.
 */
export const ChargerStatusQuerySchema = ChargerInfoQuerySchema.extend({
    updatedWithinMinutes: z.number().int().positive().optional(),
})

export type ChargerStatusQuery = z.infer<typeof ChargerStatusQuerySchema>

/**
 * Provider가 지원하는 검색 및 데이터 기능이다.
 */
export const ChargerProviderCapabilitiesSchema = z.object({
    scopes: z.array(z.enum(['NATIONWIDE', 'REGION', 'BOUNDS', 'RADIUS', 'STATIONS'])).min(1),
    pagination: z.array(z.enum(['PAGE', 'CURSOR'])).min(1),
    status: z.enum(['NONE', 'STATIC', 'DYNAMIC']),
    connectorDetails: z.boolean(),
    powerDetails: z.boolean(),
    tariffs: z.boolean(),
    limits: z.object({
        pageSize: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
        statusUpdatedWithinMinutes: z
            .object({ min: z.number().int().positive(), max: z.number().int().positive() })
            .nullable(),
        radiusMetersMax: z.number().positive().nullable(),
    }),
})

export type ChargerProviderCapabilities = z.infer<typeof ChargerProviderCapabilitiesSchema>

/**
 * 충전 커넥터 규격과 동일 규격 connector 집계다.
 */
export const ChargerConnectorSchema = z.object({
    type: z.string().trim().min(1),
    maxPowerKw: z.number().nonnegative().nullable(),
    count: z.number().int().positive(),
})

export type ChargerConnector = z.infer<typeof ChargerConnectorSchema>

/**
 * Provider별 원천 구조를 소비자가 공통으로 처리하기 위한 충전기 정보 record다.
 *
 * chargerId가 없는 API는 station 또는 connector 집계 단위로 null을 반환할 수 있다.
 */
export const ChargerInfoRecordSchema = z.object({
    providerId: ChargerProviderIdSchema,
    operatorId: z.string().trim().min(1).nullable(),
    operatorName: z.string().trim().min(1).nullable(),
    stationId: z.string().trim().min(1),
    chargerId: z.string().trim().min(1).nullable(),
    name: z.string().trim().min(1).nullable(),
    address: z.string().trim().min(1).nullable(),
    addressDetail: z.string().trim().min(1).nullable(),
    location: z
        .object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
        })
        .nullable(),
    access: z.enum(['PUBLIC', 'RESTRICTED', 'UNKNOWN']),
    operatingHours: z.string().trim().min(1).nullable(),
    connectors: z.array(ChargerConnectorSchema),
})

export type ChargerInfoRecord = z.infer<typeof ChargerInfoRecordSchema>

/**
 * 여러 provider의 원문 상태를 통합하는 최소 상태 집합이다.
 */
export const NormalizedChargerStatusSchema = z.enum([
    'AVAILABLE',
    'CHARGING',
    'RESERVED',
    'OUT_OF_SERVICE',
    'MAINTENANCE',
    'UNKNOWN',
])

export type NormalizedChargerStatus = z.infer<typeof NormalizedChargerStatusSchema>

/**
 * 개별 충전기와 connector 집계 상태를 모두 표현하는 상태 record다.
 */
export const ChargerStatusRecordSchema = z.object({
    providerId: ChargerProviderIdSchema,
    operatorId: z.string().trim().min(1).nullable(),
    stationId: z.string().trim().min(1),
    chargerId: z.string().trim().min(1).nullable(),
    status: NormalizedChargerStatusSchema,
    rawStatus: z.string().nullable(),
    statusUpdatedAt: z.string().min(1).nullable(),
    observedAt: z.string().min(1),
    availableCount: z.number().int().nonnegative().nullable(),
    outOfServiceCount: z.number().int().nonnegative().nullable(),
    totalCount: z.number().int().nonnegative(),
})

export type ChargerStatusRecord = z.infer<typeof ChargerStatusRecordSchema>

/**
 * Provider 종류와 무관한 page 응답 metadata다.
 */
export const ChargerProviderPageMetadataSchema = z.object({
    providerId: ChargerProviderIdSchema,
    page: z.number().int().min(1).nullable(),
    pageSize: z.number().int().min(0),
    totalCount: z.number().int().nonnegative().nullable(),
    nextCursor: z.string().min(1).nullable(),
    hasNext: z.boolean(),
    observedAt: z.string().min(1),
    providerMetadata: z.record(z.string(), z.unknown()),
})

export const ChargerInfoPageSchema = ChargerProviderPageMetadataSchema.extend({
    items: z.array(ChargerInfoRecordSchema),
})

export type ChargerInfoPage = z.infer<typeof ChargerInfoPageSchema>

export const ChargerStatusPageSchema = ChargerProviderPageMetadataSchema.extend({
    items: z.array(ChargerStatusRecordSchema),
})

export type ChargerStatusPage = z.infer<typeof ChargerStatusPageSchema>

/**
 * 여러 provider 구현을 한 번에 주입하는 NestJS registry token이다.
 */
export const CHARGER_PROVIDERS = Symbol('CHARGER_PROVIDERS')

/**
 * 모든 충전소 provider가 구현하는 read-only 조회 계약이다.
 *
 * 정적 정보 조회는 필수이고 상태 API가 없는 provider는 fetchStatusPage를 생략한다.
 * 호출자는 capabilities.status를 확인한 뒤 선택 operation을 사용해야 한다.
 */
export interface ChargerProviderContract {
    /**
     * Provider가 지원하는 고유 식별자다.
     */
    readonly providerId: ChargerProviderId
    /**
     * 조회 범위, pagination과 데이터 지원 수준이다.
     */
    readonly capabilities: ChargerProviderCapabilities

    /**
     * 충전소·충전기 정적 정보 페이지를 조회한다.
     */
    fetchInfoPage(query: ChargerInfoQuery): Promise<ChargerInfoPage>
    /**
     * 동적 또는 정적 상태 API를 지원하는 provider가 상태 페이지를 조회한다.
     */
    fetchStatusPage?(query: ChargerStatusQuery): Promise<ChargerStatusPage>
}
