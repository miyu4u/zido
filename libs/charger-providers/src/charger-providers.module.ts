import { Module } from '@nestjs/common'
import { config, ChargerTelemetry } from 'zido/common'
import { KecoAPIService } from './keco/keco-api.service'
import { KecoService } from './keco/keco.service'

/**
 * 전기차 충전기 공급자 연동을 담당하는 NestJS 모듈.
 * KecoAPIService와 KecoService 프로바이더를 등록 및 노출한다.
 */
@Module({
  providers: [
    {
      provide: ChargerTelemetry,
      useFactory: () => new ChargerTelemetry(),
    },
    {
      provide: KecoAPIService,
      useFactory: () => {
        return new KecoAPIService({
          serviceKey: config.charger.serviceKey || '__UNCONFIGURED__',
          endpoint: config.charger.endpoint,
          timeoutMs: config.charger.timeoutMs,
        })
      },
    },
    {
      provide: KecoService,
      useFactory: (apiService: KecoAPIService, telemetry?: ChargerTelemetry) => {
        return new KecoService(apiService, {
          telemetry,
        })
      },
      inject: [KecoAPIService, { token: ChargerTelemetry, optional: true }],
    },
  ],
  exports: [KecoAPIService, KecoService, ChargerTelemetry],
})
export class ChargerProvidersModule {}
