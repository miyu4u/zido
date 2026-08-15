import { DynamicModule, Module, Provider } from '@nestjs/common'
import { config } from 'zido/common'
import { SqliteChargerSnapshotStore } from './sqlite-charger-snapshot-store'
import { ChargerSnapshotStore, SqliteStoreOptions } from './types'

export const CHARGER_STORAGE_OPTIONS = 'CHARGER_STORAGE_OPTIONS'

/**
 * Nest module providing SQLite-backed EV charger snapshot storage.
 */
@Module({
  providers: [
    {
      provide: CHARGER_STORAGE_OPTIONS,
      useValue: {
        dbPath: config.charger?.sqlitePath ?? './.data/charger-snapshots.sqlite',
        busyTimeoutMs: 5000,
        walMode: true,
      } as SqliteStoreOptions,
    },
    {
      provide: SqliteChargerSnapshotStore,
      useFactory: (options: SqliteStoreOptions) => new SqliteChargerSnapshotStore(options),
      inject: [CHARGER_STORAGE_OPTIONS],
    },
    {
      provide: ChargerSnapshotStore,
      useExisting: SqliteChargerSnapshotStore,
    },
  ],
  exports: [SqliteChargerSnapshotStore, ChargerSnapshotStore],
})
export class ChargerStorageModule {
  /**
   * Configures ChargerStorageModule with custom SQLite storage options.
   */
  static forRoot(options: SqliteStoreOptions = {}): DynamicModule {
    const optionsProvider: Provider = {
      provide: CHARGER_STORAGE_OPTIONS,
      useValue: options,
    }

    const storeProvider: Provider = {
      provide: SqliteChargerSnapshotStore,
      useFactory: (opts: SqliteStoreOptions) => new SqliteChargerSnapshotStore(opts),
      inject: [CHARGER_STORAGE_OPTIONS],
    }

    return {
      module: ChargerStorageModule,
      providers: [
        optionsProvider,
        storeProvider,
        {
          provide: ChargerSnapshotStore,
          useExisting: SqliteChargerSnapshotStore,
        },
      ],
      exports: [SqliteChargerSnapshotStore, ChargerSnapshotStore],
    }
  }
}
