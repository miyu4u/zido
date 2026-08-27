import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Test } from '@nestjs/testing'
import { ChargerSnapshotStore, ChargerStorageError, ChargerStorageModule, SqliteChargerSnapshotStore } from '../src'

describe('SqliteChargerSnapshotStore Integration Tests', () => {
  let tempDir: string
  let dbFilePath: string
  let store: SqliteChargerSnapshotStore

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charger-storage-test-'))
    dbFilePath = path.join(tempDir, 'subfolder', 'test-snapshots.sqlite')
    store = new SqliteChargerSnapshotStore({
      dbPath: dbFilePath,
      busyTimeoutMs: 1000,
      walMode: true,
    })
  })

  afterEach(() => {
    store.close()
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('Initialization and Schema Creation', () => {
    it('creates nested parent directories and SQLite database file', () => {
      expect(fs.existsSync(dbFilePath)).toBe(true)
    })

    it('initializes in-memory database without errors when dbPath is :memory:', async () => {
      const memStore = new SqliteChargerSnapshotStore({ dbPath: ':memory:' })
      await memStore.upsertStationInfo({
        source: 'keco',
        operatorId: 'ME',
        stationId: 'MEM_01',
        name: 'In-Memory Station',
      })
      const found = await memStore.findStation('MEM_01', { source: 'keco', operatorId: 'ME' })
      expect(found).not.toBeNull()
      expect(found?.name).toBe('In-Memory Station')
      memStore.close()
    })
  })

  describe('Independent Station Info Upsert', () => {
    it('inserts and idempotently updates station catalog metadata', async () => {
      await store.upsertStationInfo({
        source: 'keco',
        operatorId: 'ME',
        stationId: 'ST_001',
        name: 'Gangnam Station',
        address: 'Teheran-ro 100',
        location: { lat: 37.498, lng: 127.027 },
        access: 'PUBLIC',
        sourceObservedAt: '2026-08-15T10:00:00.000Z',
        metadata: { parkingFree: 'Y' },
      })

      const found1 = await store.findStation('ST_001', { source: 'keco', operatorId: 'ME' })
      expect(found1).not.toBeNull()
      expect(found1?.name).toBe('Gangnam Station')
      expect(found1?.address).toBe('Teheran-ro 100')
      expect(found1?.location).toEqual({ lat: 37.498, lng: 127.027 })
      expect(found1?.access).toBe('PUBLIC')
      expect(found1?.sourceObservedAt).toBe('2026-08-15T10:00:00.000Z')

      // Update name and access idempotently without creating duplicate
      await store.upsertStationInfo({
        source: 'keco',
        operatorId: 'ME',
        stationId: 'ST_001',
        name: 'Gangnam Central Station',
        access: 'RESTRICTED',
        sourceObservedAt: '2026-08-15T11:00:00.000Z',
      })

      const found2 = await store.findStation('ST_001', { source: 'keco', operatorId: 'ME' })
      expect(found2).not.toBeNull()
      expect(found2?.name).toBe('Gangnam Central Station')
      // Address preserved from initial upsert via COALESCE
      expect(found2?.address).toBe('Teheran-ro 100')
      expect(found2?.access).toBe('RESTRICTED')
      expect(found2?.sourceObservedAt).toBe('2026-08-15T11:00:00.000Z')
    })

    it('handles multiple stations in batch upsert', async () => {
      await store.upsertStationInfo([
        {
          source: 'keco',
          operatorId: 'ME',
          stationId: 'ST_A',
          name: 'Station A',
        },
        {
          source: 'keco',
          operatorId: 'ME',
          stationId: 'ST_B',
          name: 'Station B',
        },
      ])

      const stA = await store.findStation('ST_A', { source: 'keco', operatorId: 'ME' })
      const stB = await store.findStation('ST_B', { source: 'keco', operatorId: 'ME' })
      expect(stA?.name).toBe('Station A')
      expect(stB?.name).toBe('Station B')
    })
  })

  describe('Independent Charger Status Upsert', () => {
    it('enforces composite key (source, operatorId, stationId, chargerId) idempotency', async () => {
      await store.upsertChargerStatus({
        source: 'keco',
        operatorId: 'ME',
        stationId: 'ST_001',
        chargerId: '01',
        rawStatus: '2',
        normalizedStatus: 'AVAILABLE',
        status: 'AVAILABLE',
        statusUpdatedAt: '2026-08-15T10:00:00.000Z',
        observedAt: '2026-08-15T10:00:05.000Z',
        freshness: 'FRESH',
      })

      const chargers1 = await store.findChargers({ stationId: 'ST_001' })
      expect(chargers1).toHaveLength(1)
      expect(chargers1[0].chargerId).toBe('01')
      expect(chargers1[0].status).toBe('AVAILABLE')
      expect(chargers1[0].observedAt).toBe('2026-08-15T10:00:05.000Z')

      // Upsert same composite key with new status -> updates in-place, no duplicate row
      await store.upsertChargerStatus({
        source: 'keco',
        operatorId: 'ME',
        stationId: 'ST_001',
        chargerId: '01',
        rawStatus: '3',
        normalizedStatus: 'CHARGING',
        status: 'CHARGING',
        statusUpdatedAt: '2026-08-15T10:05:00.000Z',
        observedAt: '2026-08-15T10:05:02.000Z',
        freshness: 'FRESH',
      })

      const chargers2 = await store.findChargers({ stationId: 'ST_001' })
      expect(chargers2).toHaveLength(1)
      expect(chargers2[0].chargerId).toBe('01')
      expect(chargers2[0].status).toBe('CHARGING')
      expect(chargers2[0].rawStatus).toBe('3')
      expect(chargers2[0].observedAt).toBe('2026-08-15T10:05:02.000Z')
    })

    it('ignores late older or invalid source updates', async () => {
      await store.upsertChargerStatus({
        source: 'keco',
        operatorId: 'ME',
        stationId: 'ST_ORDER',
        chargerId: '01',
        rawStatus: '3',
        normalizedStatus: 'CHARGING',
        status: 'CHARGING',
        statusUpdatedAt: '2026-08-15T10:05:00.000Z',
        observedAt: '2026-08-15T10:05:02.000Z',
        freshness: 'FRESH',
        sourceVersion: 'new',
      })

      await store.upsertChargerStatus({
        source: 'keco',
        operatorId: 'ME',
        stationId: 'ST_ORDER',
        chargerId: '01',
        rawStatus: '2',
        normalizedStatus: 'AVAILABLE',
        status: 'AVAILABLE',
        statusUpdatedAt: '20260815100000',
        observedAt: '2026-08-15T11:00:00.000Z',
        freshness: 'FRESH',
        sourceVersion: 'late',
      })
      await store.upsertChargerStatus({
        source: 'keco',
        operatorId: 'ME',
        stationId: 'ST_ORDER',
        chargerId: '01',
        rawStatus: '1',
        normalizedStatus: 'UNAVAILABLE',
        status: 'UNAVAILABLE',
        statusUpdatedAt: 'not-a-timestamp',
        observedAt: '2026-08-15T11:30:00.000Z',
        freshness: 'FRESH',
        sourceVersion: 'invalid',
      })

      const chargers = await store.findChargers({ source: 'keco', stationId: 'ST_ORDER' })
      expect(chargers).toHaveLength(1)
      expect(chargers[0]).toMatchObject({
        rawStatus: '3',
        status: 'CHARGING',
        statusUpdatedAt: '2026-08-15T10:05:00.000Z',
        observedAt: '2026-08-15T10:05:02.000Z',
        sourceVersion: 'new',
      })
    })

    it('filters chargers by stationId, source, and operatorId', async () => {
      await store.upsertChargerStatus([
        {
          source: 'keco',
          operatorId: 'ME',
          stationId: 'ST_01',
          chargerId: '01',
          observedAt: '2026-08-15T10:00:00.000Z',
        },
        {
          source: 'keco',
          operatorId: 'ME',
          stationId: 'ST_01',
          chargerId: '02',
          observedAt: '2026-08-15T10:00:00.000Z',
        },
        {
          source: 'ksga',
          operatorId: 'OP',
          stationId: 'ST_02',
          chargerId: '01',
          observedAt: '2026-08-15T10:00:00.000Z',
        },
      ])

      const st01Chargers = await store.findChargers({ stationId: 'ST_01' })
      expect(st01Chargers).toHaveLength(2)

      const ksgaChargers = await store.findChargers({ source: 'ksga' })
      expect(ksgaChargers).toHaveLength(1)
      expect(ksgaChargers[0].source).toBe('ksga')

      const noneFound = await store.findChargers({ stationId: 'NON_EXISTENT' })
      expect(noneFound).toEqual([])
    })
  })

  describe('Source-constrained station lookup', () => {
    it('does not fall back to another source when a composite key misses', async () => {
      await store.upsertStationInfo([
        {
          source: 'keco',
          operatorId: 'ME',
          stationId: 'SHARED_01',
          name: 'KECO station',
        },
        {
          source: 'ksga',
          operatorId: 'OP',
          stationId: 'SHARED_01',
          name: 'KSGA station',
        },
      ])

      const missing = await store.findStation('SHARED_01', {
        source: 'keco',
        operatorId: 'UNKNOWN',
      })
      const exact = await store.findStation('SHARED_01', {
        source: 'ksga',
        operatorId: 'OP',
      })

      expect(missing).toBeNull()
      expect(exact?.name).toBe('KSGA station')
    })
  })

  describe('Query Snapshot Read / Write & TTL Staleness', () => {
    it('atomically writes and reads query snapshot bundle with staleness evaluation', async () => {
      const observedAt = '2026-08-15T12:00:00.000Z'

      await store.writeQuerySnapshot({
        queryKey: 'zcode:11',
        source: 'keco',
        observedAt,
        stations: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_100',
            name: 'Seoul City Hall',
            address: 'Taepyeongno 1-ga',
            location: { lat: 37.5665, lng: 126.978 },
            access: 'PUBLIC',
          },
        ],
        chargers: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_100',
            chargerId: '01',
            rawStatus: '2',
            normalizedStatus: 'AVAILABLE',
            status: 'AVAILABLE',
            statusUpdatedAt: '2026-08-15T11:58:00.000Z',
            observedAt,
            freshness: 'FRESH',
          },
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_100',
            chargerId: '02',
            rawStatus: '3',
            normalizedStatus: 'CHARGING',
            status: 'CHARGING',
            statusUpdatedAt: '2026-08-15T11:59:00.000Z',
            observedAt,
            freshness: 'FRESH',
          },
        ],
      })

      // Read within TTL (300,000ms = 5 min from 12:00:00 is 12:05:00)
      const freshRead = await store.readQuerySnapshot('zcode:11', {
        ttlMs: 300_000,
        now: '2026-08-15T12:02:00.000Z',
      })
      expect(freshRead).not.toBeNull()
      expect(freshRead?.queryKey).toBe('zcode:11')
      expect(freshRead?.itemCount).toBe(2)
      expect(freshRead?.isStale).toBe(false)
      expect(freshRead?.observedAt).toBe(observedAt)
      expect(freshRead?.stations).toHaveLength(1)
      expect(freshRead?.stations[0].chargers).toHaveLength(2)
      expect(freshRead?.chargers).toHaveLength(2)

      // Read after TTL expires (e.g. 10 minutes later) -> returns stale bundle
      const staleRead = await store.readQuerySnapshot('zcode:11', {
        ttlMs: 300_000,
        now: '2026-08-15T12:10:00.000Z',
      })
      expect(staleRead).not.toBeNull()
      expect(staleRead?.isStale).toBe(true)
      expect(staleRead?.observedAt).toBe(observedAt)

      const invalidNowRead = await store.readQuerySnapshot('zcode:11', {
        ttlMs: 300_000,
        now: 'not-a-timestamp',
      })
      expect(invalidNowRead?.isStale).toBe(true)
    })

    it('distinguishes empty snapshots from unwritten / failed writes', async () => {
      // 1. Unwritten query key -> returns null
      const nonExistent = await store.readQuerySnapshot('non_existent_key')
      expect(nonExistent).toBeNull()

      // 2. Explicitly write an empty snapshot (e.g. provider returned 0 results for a region)
      const emptyObservedAt = '2026-08-15T14:00:00.000Z'
      await store.writeQuerySnapshot({
        queryKey: 'zcode:empty_region',
        source: 'keco',
        observedAt: emptyObservedAt,
        stations: [],
        chargers: [],
      })

      // 3. Reading empty snapshot returns a valid bundle with itemCount = 0
      const emptySnapshot = await store.readQuerySnapshot('zcode:empty_region')
      expect(emptySnapshot).not.toBeNull()
      expect(emptySnapshot?.queryKey).toBe('zcode:empty_region')
      expect(emptySnapshot?.itemCount).toBe(0)
      expect(emptySnapshot?.chargers).toEqual([])
      expect(emptySnapshot?.stations).toEqual([])
      expect(emptySnapshot?.observedAt).toBe(emptyObservedAt)
    })

    it('does not renew query TTL when every incoming charger row is older', async () => {
      const initialObservedAt = '2026-08-15T10:00:00.000Z'
      await store.writeQuerySnapshot({
        queryKey: 'monotonic-query',
        source: 'keco',
        observedAt: initialObservedAt,
        chargers: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_MONO',
            chargerId: '01',
            rawStatus: '3',
            normalizedStatus: 'CHARGING',
            status: 'CHARGING',
            statusUpdatedAt: '2026-08-15T09:55:00.000Z',
            observedAt: initialObservedAt,
            freshness: 'FRESH',
          },
        ],
      })

      await store.writeQuerySnapshot({
        queryKey: 'monotonic-query',
        source: 'keco',
        observedAt: '2026-08-15T11:00:00.000Z',
        chargers: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_MONO',
            chargerId: '01',
            rawStatus: '2',
            normalizedStatus: 'AVAILABLE',
            status: 'AVAILABLE',
            statusUpdatedAt: '2026-08-15T09:00:00.000Z',
            observedAt: '2026-08-15T11:00:00.000Z',
            freshness: 'FRESH',
          },
        ],
      })

      const metadata = await store.getQueryCacheMetadata('monotonic-query')
      const snapshot = await store.readQuerySnapshot('monotonic-query')
      expect(metadata?.observedAt).toBe(initialObservedAt)
      expect(snapshot?.observedAt).toBe(initialObservedAt)
      expect(snapshot?.chargers[0].status).toBe('CHARGING')
    })

    it('retrieves query cache metadata without full bundle loading', async () => {
      await store.writeQuerySnapshot({
        queryKey: 'meta_test_key',
        source: 'keco',
        observedAt: '2026-08-15T15:00:00.000Z',
        metadata: {
          scope: { mode: 'REGIONS', regionCodes: ['11'] },
          boundary: { version: '2026.08', source: 'fixture' },
        },
        chargers: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_META',
            chargerId: '01',
            observedAt: '2026-08-15T15:00:00.000Z',
          },
        ],
      })

      const meta = await store.getQueryCacheMetadata('meta_test_key')
      expect(meta).not.toBeNull()
      expect(meta?.queryKey).toBe('meta_test_key')
      expect(meta?.source).toBe('keco')
      expect(meta?.itemCount).toBe(1)
      expect(meta?.observedAt).toBe('2026-08-15T15:00:00.000Z')
      expect(meta?.metadata).toEqual({
        scope: { mode: 'REGIONS', regionCodes: ['11'] },
        boundary: { version: '2026.08', source: 'fixture' },
      })
    })

    it('correctly evaluates TTL boundary conditions for freshness', async () => {
      const observedAt = '2026-08-15T12:00:00.000Z'
      await store.writeQuerySnapshot({
        queryKey: 'boundary_test',
        source: 'keco',
        observedAt,
        chargers: [],
      })

      // Exactly at TTL edge (300,000 ms later = 12:05:00.000Z)
      const edgeFresh = await store.readQuerySnapshot('boundary_test', {
        ttlMs: 300_000,
        now: '2026-08-15T12:05:00.000Z',
      })
      expect(edgeFresh?.isStale).toBe(false)

      // 1 ms past TTL edge (12:05:00.001Z)
      const edgeStale = await store.readQuerySnapshot('boundary_test', {
        ttlMs: 300_000,
        now: '2026-08-15T12:05:00.001Z',
      })
      expect(edgeStale?.isStale).toBe(true)
    })
  })

  describe('Transactional Atomicity & Rollback Fault Preservation', () => {
    it('preserves previous observedAt and data on write failure', async () => {
      const initialObservedAt = '2026-08-15T09:00:00.000Z'

      // Step 1: Initial successful write
      await store.writeQuerySnapshot({
        queryKey: 'atomic_test_key',
        source: 'keco',
        observedAt: initialObservedAt,
        stations: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_ATOM',
            name: 'Original Station',
          },
        ],
        chargers: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_ATOM',
            chargerId: '01',
            rawStatus: '2',
            normalizedStatus: 'AVAILABLE',
            status: 'AVAILABLE',
            observedAt: initialObservedAt,
          },
        ],
      })

      const before = await store.readQuerySnapshot('atomic_test_key')
      expect(before?.observedAt).toBe(initialObservedAt)
      expect(before?.chargers[0].status).toBe('AVAILABLE')

      // Step 2: Attempt a faulty write (e.g. invalid station without stationId)
      // that throws within the transaction
      const invalidStations = [
        {
          source: 'keco',
          operatorId: 'ME',
          stationId: '', // invalid empty stationId
          name: 'Corrupt Station',
        },
      ]

      await expect(
        store.writeQuerySnapshot({
          queryKey: 'atomic_test_key',
          source: 'keco',
          observedAt: '2026-08-15T09:30:00.000Z',
          stations: invalidStations as unknown as typeof invalidStations,
          chargers: [
            {
              source: 'keco',
              operatorId: 'ME',
              stationId: 'ST_ATOM',
              chargerId: '01',
              status: 'CHARGING',
              observedAt: '2026-08-15T09:30:00.000Z',
            },
          ],
        }),
      ).rejects.toThrow()

      // Step 3: Verify the store retained previous state and observedAt
      const after = await store.readQuerySnapshot('atomic_test_key')
      expect(after?.observedAt).toBe(initialObservedAt)
      expect(after?.chargers[0].status).toBe('AVAILABLE')
    })

    it('mixed newer/stale charger payload를 부분 반영하지 않는다', async () => {
      const initialObservedAt = '2026-08-15T10:00:00.000Z'
      const stations = [
        {
          source: 'keco' as const,
          operatorId: 'ME',
          stationId: 'ST_MIXED',
          name: 'Mixed Station',
        },
      ]
      await store.writeQuerySnapshot({
        queryKey: 'mixed-age-query',
        source: 'keco',
        observedAt: initialObservedAt,
        stations,
        chargers: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_MIXED',
            chargerId: '01',
            status: 'AVAILABLE',
            observedAt: initialObservedAt,
          },
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_MIXED',
            chargerId: '02',
            status: 'AVAILABLE',
            observedAt: initialObservedAt,
          },
        ],
      })

      await store.writeQuerySnapshot({
        queryKey: 'mixed-age-query',
        source: 'keco',
        observedAt: '2026-08-15T10:30:00.000Z',
        stations,
        chargers: [
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_MIXED',
            chargerId: '01',
            status: 'CHARGING',
            observedAt: '2026-08-15T10:30:00.000Z',
          },
          {
            source: 'keco',
            operatorId: 'ME',
            stationId: 'ST_MIXED',
            chargerId: '02',
            status: 'UNAVAILABLE',
            observedAt: '2026-08-15T09:30:00.000Z',
          },
        ],
      })

      const snapshot = await store.readQuerySnapshot('mixed-age-query')
      expect(snapshot?.observedAt).toBe(initialObservedAt)
      expect(snapshot?.chargers).toEqual([
        expect.objectContaining({ chargerId: '01', status: 'AVAILABLE' }),
        expect.objectContaining({ chargerId: '02', status: 'AVAILABLE' }),
      ])
    })

    it('rejects writeQuerySnapshot with invalid data arguments', async () => {
      await expect(
        store.writeQuerySnapshot({ queryKey: '', source: 'keco', observedAt: '2026-08-15T10:00:00.000Z' }),
      ).rejects.toThrow(ChargerStorageError)
      await expect(
        store.upsertStationInfo({ source: '' as unknown as 'keco', operatorId: null, stationId: '' }),
      ).rejects.toThrow(ChargerStorageError)
      await expect(
        store.upsertChargerStatus({
          source: 'keco',
          operatorId: null,
          stationId: '',
          chargerId: '',
          observedAt: '2026-08-15T10:00:00.000Z',
        }),
      ).rejects.toThrow(ChargerStorageError)
    })
  })

  describe('Lock Contention and CHARGER_STORAGE_LOCKED Error Classification', () => {
    it('classifies SQLite lock/busy contention as CHARGER_STORAGE_LOCKED error', async () => {
      // Create a secondary connection to the same temporary file
      const rawDb2 = new DatabaseSync(dbFilePath)
      rawDb2.exec('PRAGMA busy_timeout = 10;')

      // Acquire an exclusive write lock on db2
      rawDb2.exec('BEGIN EXCLUSIVE;')

      try {
        // Now try to execute a write via the store with zero/short timeout
        const lockStore = new SqliteChargerSnapshotStore({
          dbPath: dbFilePath,
          busyTimeoutMs: 10,
          walMode: false,
        })

        let caughtError: ChargerStorageError | null = null
        try {
          await lockStore.writeQuerySnapshot({
            queryKey: 'lock_test',
            source: 'keco',
            observedAt: '2026-08-15T16:00:00.000Z',
            chargers: [],
          })
        } catch (err) {
          if (err instanceof ChargerStorageError) {
            caughtError = err
          }
        }

        expect(caughtError).not.toBeNull()
        expect(caughtError?.code).toBe('CHARGER_STORAGE_LOCKED')
        expect(caughtError?.message).toMatch(/lock|busy/i)

        lockStore.close()
      } finally {
        rawDb2.exec('ROLLBACK;')
        rawDb2.close()
      }
    })
  })

  describe('Closed Store Safety', () => {
    it('rejects operations with CHARGER_STORAGE_CLOSED after close() is called', async () => {
      const closedStore = new SqliteChargerSnapshotStore({ dbPath: ':memory:' })
      closedStore.close()

      await expect(closedStore.readQuerySnapshot('any_key')).rejects.toThrow(ChargerStorageError)
      await expect(
        closedStore.upsertStationInfo({ source: 'keco', operatorId: 'ME', stationId: 'ST_01' }),
      ).rejects.toThrow(ChargerStorageError)

      try {
        await closedStore.readQuerySnapshot('any_key')
      } catch (err) {
        expect(err).toBeInstanceOf(ChargerStorageError)
        expect((err as ChargerStorageError).code).toBe('CHARGER_STORAGE_CLOSED')
      }
    })
  })

  describe('Nest Module DI Integration', () => {
    it('provides and exports SqliteChargerSnapshotStore and ChargerSnapshotStore via ChargerStorageModule', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ChargerStorageModule.forRoot({
            dbPath: path.join(tempDir, 'nest-di-test.sqlite'),
            busyTimeoutMs: 2000,
          }),
        ],
      }).compile()

      const abstractStore = moduleRef.get<ChargerSnapshotStore>(ChargerSnapshotStore)
      const concreteStore = moduleRef.get<SqliteChargerSnapshotStore>(SqliteChargerSnapshotStore)

      expect(abstractStore).toBeDefined()
      expect(concreteStore).toBeDefined()
      expect(abstractStore).toBe(concreteStore)

      await abstractStore.upsertStationInfo({
        source: 'keco',
        operatorId: 'ME',
        stationId: 'NEST_ST_01',
        name: 'Nest Test Station',
      })

      const found = await concreteStore.findStation('NEST_ST_01', { source: 'keco', operatorId: 'ME' })
      expect(found?.name).toBe('Nest Test Station')

      await moduleRef.close()
    })
  })
})
