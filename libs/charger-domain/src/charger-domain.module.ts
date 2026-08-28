import { Module } from '@nestjs/common'
import { ChargerStorageModule } from 'zido/charger-storage'
import { ChargerProvidersModule, KEcoService } from 'zido/charger-providers'
import { ChargerSnapshotStore } from 'zido/charger-storage'
import { RefreshCoordinator } from './refresh-coordinator'
import { ChargerService } from './charger-service'
import { DeterministicLocalBoundaryResolver } from './collection-scope'

/**
 * KECO 수집, snapshot 저장, charger 조회 capability를 연결한다.
 */
@Module({
  imports: [ChargerStorageModule, ChargerProvidersModule],
  providers: [
    {
      provide: RefreshCoordinator,
      useFactory: (provider: KEcoService, store: ChargerSnapshotStore) => new RefreshCoordinator(provider, store),
      inject: [KEcoService, ChargerSnapshotStore],
    },
    {
      provide: ChargerService,
      useFactory: (
        store: ChargerSnapshotStore,
        coordinator: RefreshCoordinator,
        resolver: DeterministicLocalBoundaryResolver,
      ) => new ChargerService(store, coordinator, resolver),
      inject: [ChargerSnapshotStore, RefreshCoordinator, DeterministicLocalBoundaryResolver],
    },
    DeterministicLocalBoundaryResolver,
  ],
  exports: [ChargerService],
})
export class ChargerDomainModule {}
