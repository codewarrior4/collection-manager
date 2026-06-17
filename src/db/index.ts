import { openDB, type IDBPDatabase } from 'idb'
import type { Collection, Environment } from '@/types'

/**
 * Describes the shape of the IndexedDB database used by the app.
 * Two object stores: `collections` and `environments`, both keyed by `id`.
 */
interface AppDB {
  collections: {
    key: string
    value: Collection
  }
  environments: {
    key: string
    value: Environment
  }
}

/**
 * Resolves to the opened IDBPDatabase instance.
 * Consumed by Pinia stores for all persistence reads and writes.
 */
export const db: Promise<IDBPDatabase<AppDB>> = openDB<AppDB>(
  'api-collection-manager',
  1,
  {
    upgrade(database, oldVersion) {
      // Apply incremental migration steps
      if (oldVersion < 1) {
        if (!database.objectStoreNames.contains('collections')) {
          database.createObjectStore('collections', { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains('environments')) {
          database.createObjectStore('environments', { keyPath: 'id' })
        }
      }
    },
  },
)
