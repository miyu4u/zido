import { Module } from '@nestjs/common'
import { config, ChargerTelemetry } from 'zido/common'
import { KecoProvider } from './keco/keco-provider'

@Module({
  providers: [
    {
      provide: ChargerTelemetry,
      useFactory: () => new ChargerTelemetry(),
    },
    {
      provide: KecoProvider,
      useFactory: (telemetry?: ChargerTelemetry) => {
        return new KecoProvider({
          serviceKey: config.charger?.serviceKey || '__UNCONFIGURED__',
          endpoint: config.charger?.endpoint,
          timeoutMs: config.charger?.timeoutMs,
          telemetry,
        })
      },
      inject: [{ token: ChargerTelemetry, optional: true }],
    },
  ],
  exports: [KecoProvider, ChargerTelemetry],
})
export class ChargerProvidersModule {}
