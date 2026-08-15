import { Module } from '@nestjs/common'
import { ChargerStorageModule } from 'zido/charger-storage'
import { ChargerProvidersModule, KecoProvider } from 'zido/charger-providers'
import { ChargerSnapshotStore } from 'zido/charger-storage'
import { RefreshCoordinator } from './refresh-coordinator'
import { ChargerService } from './charger-service'

@Module({
  imports: [ChargerStorageModule, ChargerProvidersModule],
  providers: [
    {
      provide: RefreshCoordinator,
      useFactory: (provider: KecoProvider, store: ChargerSnapshotStore) =>
        new RefreshCoordinator(provider, store),
      inject: [KecoProvider, ChargerSnapshotStore],
    },
    {
      provide: ChargerService,
      useFactory: (store: ChargerSnapshotStore, coordinator: RefreshCoordinator) =>
        new ChargerService(store, coordinator),
      inject: [ChargerSnapshotStore, RefreshCoordinator],
    },
  ],
  exports: [ChargerService, RefreshCoordinator],
})
export class ChargerDomainModule {}
