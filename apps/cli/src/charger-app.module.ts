import { Module } from '@nestjs/common'
import { ChargerDomainModule } from 'zido/charger-domain'

/**
 * Charger command에서만 SQLite snapshot과 KECO domain graph를 지연 초기화한다.
 */
@Module({
  imports: [ChargerDomainModule],
})
export class ChargerCliAppModule {}
