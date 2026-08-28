import { Module } from '@nestjs/common'
import { ChargerTelemetry, config } from 'zido/common'
import { CHARGER_PROVIDERS, type ChargerProviderContract } from './charger-provider.contract'
import { KEcoAPIService } from './k-eco/k-eco-api.service'
import { KEcoService } from './k-eco/k-eco.service'

/**
 * 충전소 provider adapter와 원천 API client를 등록한다.
 */
@Module({
  providers: [
    ChargerTelemetry,
    {
      provide: KEcoAPIService,
      useFactory: () =>
        new KEcoAPIService({
          serviceKey: config.charger.serviceKey,
          endpoint: config.charger.endpoint,
          timeoutMs: config.charger.timeoutMs,
        }),
    },
    KEcoService,
    {
      provide: CHARGER_PROVIDERS,
      useFactory: (keco: KEcoService): ChargerProviderContract[] => [keco],
      inject: [KEcoService],
    },
  ],
  exports: [CHARGER_PROVIDERS, KEcoAPIService, KEcoService, ChargerTelemetry],
})
export class ChargerProvidersModule {}
