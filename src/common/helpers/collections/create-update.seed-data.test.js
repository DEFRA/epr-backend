import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { ObjectId } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'
import { createSeedData } from './create-update.js'
import { createMockDb as createSharedMockDb } from '#test/mock-db.js'

/**
 * @import { Collection } from 'mongodb'
 * @import { WasteRecordsRepository } from '#repositories/waste-records/port.js'
 */

const PRODUCTION = () => true
const NON_PRODUCTION = () => false

/** @type {WasteRecordsRepository} */
const mockWasteRecordsRepository = {
  appendVersions: vi.fn(async () => {}),
  findByRegistration: vi.fn(async () => []),
  findDistinctDataKeys: vi.fn(async () => [])
}

describe('createSeedData', () => {
  it('does not create seed data in production', async () => {
    const { mockDb, insertions } = createMockDb({
      countDocuments: async () => 0
    })
    await createSeedData(
      mockDb,
      PRODUCTION,
      createInMemoryOrganisationsRepository()(),
      mockWasteRecordsRepository
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
        createInMemoryOrganisationsRepository()(),
        mockWasteRecordsRepository
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

    await createSeedData(
      mockDb,
      NON_PRODUCTION,
      repository,
      mockWasteRecordsRepository
    )

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
        createInMemoryOrganisationsRepository()(),
        mockWasteRecordsRepository
      )

      expect(
        insertions.map((insertion) => insertion.collectionName)
      ).not.toContain(collectionName)
    }
  )

  it('does not create epr-organisation seed data when the fixtures are already present in the collection', async () => {
    const { mockDb } = createMockDb({
      countDocuments: async () => 1,
      find: (_query) => ({
        toArray: async () => [
          ObjectId.createFromHexString('6507f1f77bcf86cd79943901')
        ]
      })
    })

    const repository = createInMemoryOrganisationsRepository()()
    const spy = vi.spyOn(repository, 'insert')

    await createSeedData(
      mockDb,
      NON_PRODUCTION,
      repository,
      mockWasteRecordsRepository
    )

    expect(spy).not.toHaveBeenCalled()
  })

  it('creates waste records seed data using repository', async () => {
    const { mockDb } = createMockDb({
      countDocuments: async () => 0
    })

    await createSeedData(
      mockDb,
      NON_PRODUCTION,
      createInMemoryOrganisationsRepository()(),
      mockWasteRecordsRepository
    )

    expect(mockWasteRecordsRepository.appendVersions).toHaveBeenCalled()
  })
})

/**
 * @param {{
 *   countDocuments?: () => Promise<number>,
 *   find?: (query?: unknown) => { toArray: () => Promise<unknown[]> }
 * }} [overrides]
 */
function createMockDb({
  countDocuments = async () => 0,
  find = () => ({ toArray: async () => [] })
} = {}) {
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
          countDocuments,
          find
        })
      )
  })

  return { insertions, mockDb }
}
