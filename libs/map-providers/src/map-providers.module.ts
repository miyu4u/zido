import { Module } from '@nestjs/common'
import { ProviderRouterService } from './provider-router'

/**
 * 지도 provider와 fallback router를 하나의 DI 경계로 묶는다.
 */
@Module({
  providers: [ProviderRouterService],
  exports: [ProviderRouterService],
})
export class MapProvidersModule {}
