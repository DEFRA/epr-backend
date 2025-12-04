import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'
import { cleanupSeedData, createSeedData } from './create-update'

const PRODUCTION = () => true
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

  it('does not create epr-organisation seed data when the fixtures are already present in the collection ', async () => {
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

    await createSeedData(mockDb, NON_PRODUCTION, repository)

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('cleanupSeedData', () => {
  const DRY_RUN = () => true
  const ACTUAL_RUN = () => false

  const REGISTRATION_ACCREDITATION_FIXTURE_IDS = [
    'aaaabbbbccccddddeeee4444',
    'aaaabbbbccccddddeeee5555'
  ].map(ObjectId.createFromHexString)

  const findResults = (query) => {
    let results = []

    if (query.referenceNumber === '123ab456789cd01e23fabc45') {
      results = REGISTRATION_ACCREDITATION_FIXTURE_IDS.map((_id) => ({ _id }))
    }

    return {
      toArray: async () => results
    }
  }

  it('deletes seed data in production', async () => {
    const { mockDb, deletions } = createMockDb({
      find: findResults
    })

    const hasRun = await cleanupSeedData(mockDb, {
      isProduction: PRODUCTION,
      isDryRun: ACTUAL_RUN
    })

    expect(hasRun).toBeTruthy()

    expect(deletions).toContainEqual({
      collectionName: 'registration',
      query: {
        _id: {
          $in: REGISTRATION_ACCREDITATION_FIXTURE_IDS
        }
      }
    })
    expect(deletions).toContainEqual({
      collectionName: 'accreditation',
      query: {
        _id: {
          $in: REGISTRATION_ACCREDITATION_FIXTURE_IDS
        }
      }
    })

    expect(deletions).toHaveLength(2)
  })

  it('does not attempt to delete anything (in production) when no candidate documents are found', async () => {
    const { mockDb, deletions } = createMockDb({})

    const hasRun = await cleanupSeedData(mockDb, {
      isProduction: PRODUCTION,
      isDryRun: ACTUAL_RUN
    })

    expect(hasRun).toBeTruthy()
    expect(deletions).toHaveLength(0)
  })

  it('does not remove seed data in production on a dry run', async () => {
    const { mockDb, deletions } = createMockDb({
      find: findResults
    })

    const hasRun = await cleanupSeedData(mockDb, {
      isProduction: PRODUCTION,
      isDryRun: DRY_RUN
    })

    expect(hasRun).toBeTruthy()
    expect(deletions).toHaveLength(0)
  })

  it('does not remove seed data when in environments that are not production', async () => {
    const { mockDb, deletions } = createMockDb({
      find: findResults
    })

    const hasRun = await cleanupSeedData(mockDb, {
      isProduction: NON_PRODUCTION,
      isDryRun: ACTUAL_RUN
    })

    expect(hasRun).not.toBeTruthy()
    expect(deletions).toHaveLength(0)
  })
})

function createMockDb({
  countDocuments = async () => 0,
  find = () => ({ toArray: async () => [] })
} = {}) {
  const deletions = []
  const insertions = []
  return {
    deletions,
    insertions,
    mockDb: {
      collection: (collectionName) => ({
        deleteMany: (query) => {
          deletions.push({ collectionName, query })
          return { deletedCount: 0 }
        },
        insertMany: (items) => {
          insertions.push({ collectionName, items })
          return { insertedIds: [] }
        },
        countDocuments,
        find
      })
    }
  }
}
