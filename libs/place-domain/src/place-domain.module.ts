import { Module } from '@nestjs/common'
import { MapProvidersModule } from 'zido/map-providers'
import { PlaceService } from './place-service'

/**
 * 장소 orchestration과 provider router의 의존성 경계를 구성한다.
 */
@Module({
  imports: [MapProvidersModule],
  providers: [PlaceService],
  exports: [PlaceService],
})
export class PlaceDomainModule {}
