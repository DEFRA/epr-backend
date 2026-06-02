import { vi } from 'vitest'

/** @import { Collection, Db } from 'mongodb' */

/**
 * Default collection-method stubs covering the methods the repositories
 * actually call against a collection. Tests override individual methods via
 * `createMockDb({ findOne: async () => ... })`.
 *
 * @returns {Record<string, import('vitest').Mock>}
 */
const defaultCollectionMethods = () => ({
  createIndex: vi.fn(async () => 'index_name'),
  countDocuments: vi.fn(async () => 0),
  findOne: vi.fn(async () => null),
  find: vi.fn(() => ({ toArray: async () => [] })),
  insertOne: vi.fn(async () => ({ insertedId: { toHexString: () => '' } })),
  insertMany: vi.fn(async () => ({ insertedIds: {} })),
  updateOne: vi.fn(async () => ({ matchedCount: 0, modifiedCount: 0 })),
  replaceOne: vi.fn(async () => ({ matchedCount: 0, modifiedCount: 0 })),
  deleteOne: vi.fn(async () => ({ deletedCount: 0 })),
  deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
  findOneAndUpdate: vi.fn(async () => null),
  aggregate: vi.fn(() => ({ toArray: async () => [] }))
})

/**
 * @typedef {object} MockDbOverrides
 * @property {(name: string) => Collection} [collection] - full control over
 *   what `db.collection(name)` returns; takes precedence over method stubs.
 */

/**
 * Builds a typed mock Mongo `Db` for tests. By default `db.collection(name)`
 * returns a single shared collection mock whose methods are `vi.fn()`s.
 *
 * Pass collection-method stubs to override individual methods on that shared
 * collection (e.g. `{ findOne: async () => doc }`), or pass a `collection`
 * factory to take full control of what each `collection(name)` call returns.
 *
 * Only the surface the repositories use is implemented, so the result is cast
 * to `Db` at the boundary -- fully satisfying mongodb's `Db` (30+ members) is
 * impractical and unnecessary for these tests.
 *
 * @param {MockDbOverrides & Record<string, unknown>} [overrides]
 * @returns {Db}
 */
export const createMockDb = (overrides = {}) => {
  const { collection: collectionOverride, ...methodOverrides } = overrides

  const collection = /** @type {Collection} */ (
    /** @type {unknown} */ ({
      ...defaultCollectionMethods(),
      ...methodOverrides
    })
  )

  const collectionFactory =
    collectionOverride ??
    /** @type {(name: string) => Collection} */ (() => collection)

  return /** @type {Db} */ (
    /** @type {unknown} */ ({
      collection: vi.fn(collectionFactory)
    })
  )
}
