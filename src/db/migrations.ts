import type { IDBPDatabase } from 'idb'

/**
 * Applies incremental schema migration steps inside the `idb` upgrade callback.
 *
 * Each step is guarded by `oldVersion < N` so upgrades from any older version
 * are safe. No data is deleted — fields are added with defaults only.
 *
 * Version history:
 *   1 → Initial schema (collections + environments object stores).
 *       The stores are created in db/index.ts upgrade callback; this step is a no-op.
 */
export function applyMigrations(
  database: IDBPDatabase,
  oldVersion: number,
  _newVersion: number | null,
): void {
  // Version 1: stores are created directly in the openDB upgrade callback.
  // This function is the extension point for future schema versions.
  if (oldVersion < 1) {
    // no-op — handled by openDB upgrade in index.ts
  }

  // Example future migration (version 2):
  // if (oldVersion < 2) {
  //   // e.g. add an index, add a new object store, backfill a field
  // }

  void database // suppress unused-variable warning until future migrations are added
}
