import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { describe, expect, it, vi } from 'vitest'
import { createSeedData } from './create-seed-data.js'
import { createMockDb as createSharedMockDb } from '#test/mock-db.js'

/**
 * @import { Collection } from 'mongodb'
 */

const PRODUCTION = () => true
const waitForCacheSync = () => new Promise((resolve) => setImmediate(resolve))
const NON_PRODUCTION = () => false

describe('createSeedData', () => {
  it('does not create seed data in production', async () => {
    const { mockDb, insertions } = createMockDb({
      countDocuments: async () => 0
    })
    await createSeedData(
      mockDb,
      PRODUCTION,
      createInMemoryOrganisationsRepository()()
    )
    expect(insertions).toHaveLength(0)
  })

  it.each(['organisation', 'registration', 'accreditation'])(
    'creates seed data when there are no documents already in collection %s',
    async (collectionName) => {
      const { mockDb, insertions } = createMockDb({
        countDocuments: async () => 0
      })

      await createSeedData(
        mockDb,
        NON_PRODUCTION,
        createInMemoryOrganisationsRepository()()
      )

      expect(insertions.map((insertion) => insertion.collectionName)).toContain(
        collectionName
      )
    }
  )

  it('creates seed data when there are no documents already in epr-organisations collection', async () => {
    const { mockDb } = createMockDb({
      countDocuments: async () => 0
    })

    const repository = createInMemoryOrganisationsRepository()()
    const spy = vi.spyOn(repository, 'insert')

    await createSeedData(mockDb, NON_PRODUCTION, repository)

    expect(spy).toHaveBeenCalled()
  })

  it.each(['organisation', 'registration', 'accreditation'])(
    'does not creates seed data when the collection contains documents %s',
    async (collectionName) => {
      const { mockDb, insertions } = createMockDb({
        countDocuments: async () => 1
      })

      await createSeedData(
        mockDb,
        NON_PRODUCTION,
        createInMemoryOrganisationsRepository()()
      )

      expect(
        insertions.map((insertion) => insertion.collectionName)
      ).not.toContain(collectionName)
    }
  )

  it('does not create epr-organisation seed data when the organisations already exist', async () => {
    const { mockDb } = createMockDb({
      countDocuments: async () => 1
    })

    const repository = createInMemoryOrganisationsRepository()()
    await createSeedData(mockDb, NON_PRODUCTION, repository)
    await waitForCacheSync()
    const spy = vi.spyOn(repository, 'insert')

    await createSeedData(mockDb, NON_PRODUCTION, repository)

    expect(spy).not.toHaveBeenCalled()
  })
})

/**
 * @param {{
 *   countDocuments?: () => Promise<number>
 * }} [overrides]
 */
function createMockDb({ countDocuments = async () => 0 } = {}) {
  /** @type {Array<{ collectionName: string, items: unknown }>} */
  const insertions = []
  const mockDb = createSharedMockDb({
    collection: (collectionName) =>
      /** @type {Collection} */ (
        /** @type {unknown} */ ({
          insertMany: (items) => {
            insertions.push({ collectionName, items })
            return { insertedIds: [] }
          },
          countDocuments
        })
      )
  })

  return { insertions, mockDb }
}
