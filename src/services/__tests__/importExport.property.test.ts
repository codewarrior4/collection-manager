// Feature: postman, Property 3: Collection Export–Import Round-Trip

/**
 * Property-based tests for `src/services/importExport.ts`
 *
 * Property 3: Collection Export–Import Round-Trip
 *   For any valid Collection object (with arbitrary nesting of Folders and
 *   Requests), calling serializeCollection(c) followed by
 *   deserializeCollection(json) SHALL produce a collection that is deeply
 *   equal to the original — all field values, nested structures, and ordering
 *   preserved.
 *
 * Validates: Requirements 6.2, 6.6
 *
 * Minimum iterations: 100 (configured via fc.configureGlobal)
 */

import * as fc from 'fast-check'
import { describe, expect, it, beforeAll } from 'vitest'
import { serializeCollection, deserializeCollection } from '../importExport'
import type { Collection, Folder, Request, KeyValue, HttpMethod } from '../../types/index'

// ---------------------------------------------------------------------------
// fast-check global configuration — minimum 100 iterations per property
// ---------------------------------------------------------------------------
beforeAll(() => {
  fc.configureGlobal({ numRuns: 100 })
})

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty string suitable for names, keys, values. */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 30 })

/** A valid HTTP method. */
const httpMethodArb = fc.constantFrom<HttpMethod>('GET', 'POST', 'PUT', 'PATCH', 'DELETE')

/** A body type. */
const bodyTypeArb = fc.constantFrom<'json' | 'form' | 'x-www-form-urlencoded'>(
  'json',
  'form',
  'x-www-form-urlencoded',
)

/** A KeyValue pair. */
const keyValueArb: fc.Arbitrary<KeyValue> = fc.record({
  key: nonEmptyStringArb,
  value: fc.string({ minLength: 0, maxLength: 40 }),
  enabled: fc.boolean(),
})

/** Auth configuration covering all three auth types. */
const authArb = fc.oneof(
  fc.record({ type: fc.constant('none' as const) }),
  fc.record({
    type: fc.constant('bearer' as const),
    token: fc.string({ minLength: 0, maxLength: 60 }),
  }),
  fc.record({
    type: fc.constant('basic' as const),
    username: fc.string({ minLength: 0, maxLength: 30 }),
    password: fc.string({ minLength: 0, maxLength: 30 }),
  }),
)

/** A complete Request object. */
const requestArb: fc.Arbitrary<Request> = fc.record({
  id: fc.uuid(),
  name: nonEmptyStringArb,
  method: httpMethodArb,
  url: fc.string({ minLength: 1, maxLength: 80 }),
  headers: fc.array(keyValueArb, { minLength: 0, maxLength: 3 }),
  body: fc.record({
    type: bodyTypeArb,
    content: fc.string({ minLength: 0, maxLength: 100 }),
  }),
  auth: authArb,
})

/**
 * Build a Folder arbitrary at a fixed depth.
 * depth === 0 → no nested sub-folders (only requests).
 * depth > 0   → may contain sub-folders at depth - 1.
 *
 * We use a plain function instead of fc.letrec to avoid unbounded recursion.
 * The depth cap ensures the call stack stays shallow during generation.
 */
function folderAtDepth(depth: number): fc.Arbitrary<Folder> {
  const subFolders =
    depth <= 0
      ? fc.constant([] as Folder[])
      : fc.array(folderAtDepth(depth - 1), { minLength: 0, maxLength: 2 })

  return fc.record({
    id: fc.uuid(),
    name: nonEmptyStringArb,
    folders: subFolders,
    requests: fc.array(requestArb, { minLength: 0, maxLength: 3 }),
  })
}

/**
 * A Collection arbitrary that contains folders up to 2 levels deep.
 * This is sufficient to exercise nested structure while keeping generation
 * fast and stack-safe.
 */
const collectionArb: fc.Arbitrary<Collection> = fc.record({
  id: fc.uuid(),
  name: nonEmptyStringArb,
  folders: fc.array(folderAtDepth(2), { minLength: 0, maxLength: 3 }),
  requests: fc.array(requestArb, { minLength: 0, maxLength: 3 }),
})

// ---------------------------------------------------------------------------
// Property 3: Round-Trip — serialize then deserialize yields deep equality
// ---------------------------------------------------------------------------

describe('Property 3 — Collection Export–Import Round-Trip', () => {
  it(
    'deserializeCollection(serializeCollection(c)) is deeply equal to the original collection',
    () => {
      fc.assert(
        fc.property(collectionArb, (collection) => {
          const json = serializeCollection(collection)
          const restored = deserializeCollection(json)
          expect(restored).toEqual(collection)
        }),
      )
    },
  )

  it('the serialized form is valid JSON for any generated collection', () => {
    fc.assert(
      fc.property(collectionArb, (collection) => {
        const json = serializeCollection(collection)
        expect(() => JSON.parse(json)).not.toThrow()
      }),
    )
  })

  it('round-trip preserves the collection id exactly', () => {
    fc.assert(
      fc.property(collectionArb, (collection) => {
        const restored = deserializeCollection(serializeCollection(collection))
        expect(restored.id).toBe(collection.id)
      }),
    )
  })

  it('round-trip preserves the collection name exactly', () => {
    fc.assert(
      fc.property(collectionArb, (collection) => {
        const restored = deserializeCollection(serializeCollection(collection))
        expect(restored.name).toBe(collection.name)
      }),
    )
  })

  it('round-trip preserves the top-level folder count', () => {
    fc.assert(
      fc.property(collectionArb, (collection) => {
        const restored = deserializeCollection(serializeCollection(collection))
        expect(restored.folders).toHaveLength(collection.folders.length)
      }),
    )
  })

  it('round-trip preserves the top-level request count', () => {
    fc.assert(
      fc.property(collectionArb, (collection) => {
        const restored = deserializeCollection(serializeCollection(collection))
        expect(restored.requests).toHaveLength(collection.requests.length)
      }),
    )
  })

  it('round-trip preserves all request fields including method, url, headers, body, and auth', () => {
    fc.assert(
      fc.property(
        collectionArb.filter((c) => c.requests.length > 0),
        (collection) => {
          const restored = deserializeCollection(serializeCollection(collection))
          for (let i = 0; i < collection.requests.length; i++) {
            expect(restored.requests[i]).toEqual(collection.requests[i])
          }
        },
      ),
    )
  })

  it('round-trip preserves nested folder structure and ordering', () => {
    fc.assert(
      fc.property(
        collectionArb.filter((c) => c.folders.length > 0),
        (collection) => {
          const restored = deserializeCollection(serializeCollection(collection))
          for (let i = 0; i < collection.folders.length; i++) {
            expect(restored.folders[i].id).toBe(collection.folders[i].id)
            expect(restored.folders[i].name).toBe(collection.folders[i].name)
          }
        },
      ),
    )
  })

  it('round-trip preserves requests inside nested folders', () => {
    fc.assert(
      fc.property(
        collectionArb.filter((c) => c.folders.some((f) => f.requests.length > 0)),
        (collection) => {
          const restored = deserializeCollection(serializeCollection(collection))
          for (let fi = 0; fi < collection.folders.length; fi++) {
            const origFolder = collection.folders[fi]
            const restFolder = restored.folders[fi]
            expect(restFolder.requests).toHaveLength(origFolder.requests.length)
            for (let ri = 0; ri < origFolder.requests.length; ri++) {
              expect(restFolder.requests[ri]).toEqual(origFolder.requests[ri])
            }
          }
        },
      ),
    )
  })

  it('round-trip preserves sub-folders nested inside top-level folders', () => {
    fc.assert(
      fc.property(
        collectionArb.filter((c) => c.folders.some((f) => f.folders.length > 0)),
        (collection) => {
          const restored = deserializeCollection(serializeCollection(collection))
          for (let fi = 0; fi < collection.folders.length; fi++) {
            const origFolder = collection.folders[fi]
            const restFolder = restored.folders[fi]
            expect(restFolder.folders).toHaveLength(origFolder.folders.length)
            for (let sfi = 0; sfi < origFolder.folders.length; sfi++) {
              expect(restFolder.folders[sfi]).toEqual(origFolder.folders[sfi])
            }
          }
        },
      ),
    )
  })

  it('round-trip is idempotent: a second serialize/deserialize pass produces the same result', () => {
    fc.assert(
      fc.property(collectionArb, (collection) => {
        const firstPass = deserializeCollection(serializeCollection(collection))
        const secondPass = deserializeCollection(serializeCollection(firstPass))
        expect(secondPass).toEqual(firstPass)
      }),
    )
  })

  it('preserves all enabled flags on KeyValue header entries through the round-trip', () => {
    fc.assert(
      fc.property(
        collectionArb.filter((c) => c.requests.some((r) => r.headers.length > 0)),
        (collection) => {
          const restored = deserializeCollection(serializeCollection(collection))
          for (let ri = 0; ri < collection.requests.length; ri++) {
            const origReq = collection.requests[ri]
            const restReq = restored.requests[ri]
            for (let hi = 0; hi < origReq.headers.length; hi++) {
              expect(restReq.headers[hi].enabled).toBe(origReq.headers[hi].enabled)
              expect(restReq.headers[hi].key).toBe(origReq.headers[hi].key)
              expect(restReq.headers[hi].value).toBe(origReq.headers[hi].value)
            }
          }
        },
      ),
    )
  })

  it('preserves auth configuration including bearer token and basic credentials', () => {
    fc.assert(
      fc.property(
        collectionArb.filter((c) =>
          c.requests.some((r) => r.auth.type === 'bearer' || r.auth.type === 'basic'),
        ),
        (collection) => {
          const restored = deserializeCollection(serializeCollection(collection))
          for (let ri = 0; ri < collection.requests.length; ri++) {
            expect(restored.requests[ri].auth).toEqual(collection.requests[ri].auth)
          }
        },
      ),
    )
  })
})
