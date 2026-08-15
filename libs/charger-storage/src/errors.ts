/**
 * Error codes for charger snapshot storage operations.
 */
export type ChargerStorageErrorCode =
  | 'CHARGER_STORAGE_LOCKED'
  | 'CHARGER_STORAGE_INVALID_DATA'
  | 'CHARGER_STORAGE_NOT_FOUND'
  | 'CHARGER_STORAGE_IO_ERROR'
  | 'CHARGER_STORAGE_TRANSACTION_ERROR'
  | 'CHARGER_STORAGE_CLOSED'

/**
 * Explicit storage error subclass for SQLite storage failures and lock classification.
 */
export class ChargerStorageError extends Error {
  public readonly code: ChargerStorageErrorCode
  public override readonly cause?: unknown

  constructor(code: ChargerStorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ChargerStorageError'
    this.code = code
    this.cause = options?.cause
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Classifies an unknown error into a typed ChargerStorageError.
 * Maps SQLite busy/locked errors (SQLITE_BUSY, SQLITE_LOCKED) to CHARGER_STORAGE_LOCKED.
 */
export function toChargerStorageError(err: unknown, fallbackMessage = 'Storage operation failed'): ChargerStorageError {
  if (err instanceof ChargerStorageError) {
    return err
  }

  const errorObj = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null
  const errcode = typeof errorObj?.errcode === 'number' ? errorObj.errcode : null
  const msg = err instanceof Error ? err.message : String(err)

  // SQLite error codes: 5 = SQLITE_BUSY, 6 = SQLITE_LOCKED, 261 = SQLITE_BUSY_RECOVERY, 517 = SQLITE_BUSY_SNAPSHOT
  const isBusyOrLocked =
    errcode === 5 ||
    errcode === 6 ||
    errcode === 261 ||
    errcode === 517 ||
    errcode === 262 ||
    /database is locked|database is busy|resource temporarily unavailable/i.test(msg)

  if (isBusyOrLocked) {
    return new ChargerStorageError(
      'CHARGER_STORAGE_LOCKED',
      `SQLite storage lock contention: ${msg || fallbackMessage}`,
      { cause: err },
    )
  }

  return new ChargerStorageError('CHARGER_STORAGE_IO_ERROR', `${fallbackMessage}: ${msg}`, { cause: err })
}
