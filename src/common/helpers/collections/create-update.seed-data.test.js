import { describe, it, expect } from 'vitest'
import { cleanupSeedData, createSeedData } from './create-update'
import { ObjectId } from 'mongodb'

const PRODUCTION = () => true
const NON_PRODUCTION = () => false

describe('createSeedData', () => {
  it('does not create seed data in production', async () => {
    const insertions = []
    const mockDb = createMockDb({
      countDocuments: async () => 0,
      insertions
    })
    await createSeedData(mockDb, PRODUCTION)
    expect(insertions).toHaveLength(0)
  })

  it.each([
    'organisation',
    'registration',
    'accreditation',
    'epr-organisations'
  ])(
    'creates seed data when there are no documents already in collection %s',
    async (collectionName) => {
      const insertions = []
      const mockDb = createMockDb({
        countDocuments: async () => 0,
        insertions
      })
      await createSeedData(mockDb, NON_PRODUCTION)

      expect(insertions.map((insertion) => insertion.collectionName)).toContain(
        collectionName
      )
    }
  )

  it.each(['organisation', 'registration', 'accreditation'])(
    'does not creates seed data when the collection contains documents %s',
    async (collectionName) => {
      const insertions = []
      const mockDb = createMockDb({
        countDocuments: async () => 1,
        insertions
      })
      await createSeedData(mockDb, NON_PRODUCTION)

      expect(
        insertions.map((insertion) => insertion.collectionName)
      ).not.toContain(collectionName)
    }
  )

  it('does not create epr-organisation seed data when the fixtures are already present in the collection ', async () => {
    const insertions = []
    const findResults = (query) => {
      return {
        toArray: async () => [
          ObjectId.createFromHexString('6507f1f77bcf86cd79943901')
        ]
      }
    }

    const mockDb = createMockDb({
      countDocuments: async () => 1,
      find: findResults,
      insertions
    })
    await createSeedData(mockDb, NON_PRODUCTION)

    expect(
      insertions.map((insertion) => insertion.collectionName)
    ).not.toContain('epr-organisations')
  })
})

describe('cleanupSeedData', () => {
  const DRY_RUN = () => true
  const ACTUAL_RUN = () => false

  const EPR_ORGANISATION_FIXTURE_IDS = [
    'aaaabbbbccccddddeeee0000',
    'aaaabbbbccccddddeeee1111'
  ].map(ObjectId.createFromHexString)

  const ORGANISATION_FIXTURE_IDS = [
    'aaaabbbbccccddddeeee2222',
    'aaaabbbbccccddddeeee3333'
  ].map(ObjectId.createFromHexString)

  const REGISTRATION_ACCREDITATION_FIXTURE_IDS = [
    'aaaabbbbccccddddeeee4444',
    'aaaabbbbccccddddeeee5555'
  ].map(ObjectId.createFromHexString)

  const findResults = (query) => {
    let results = []

    if (
      query['companyDetails.name'] === 'Testing Limited' &&
      query['companyDetails.registrationNumber'] === 'TT123456'
    ) {
      results = EPR_ORGANISATION_FIXTURE_IDS.map((_id) => ({ _id }))
    }

    if (query._id?.$in.includes(EPR_ORGANISATION_FIXTURE_IDS[0])) {
      results = ORGANISATION_FIXTURE_IDS.map((_id) => ({ _id }))
    }

    if (
      query.referenceNumber?.$in.includes(
        EPR_ORGANISATION_FIXTURE_IDS[0].toString()
      )
    ) {
      results = REGISTRATION_ACCREDITATION_FIXTURE_IDS.map((_id) => ({ _id }))
    }

    return {
      toArray: async () => results
    }
  }

  it('deletes seed data in production', async () => {
    const deletions = []

    const mockDb = createMockDb({
      deletions,
      find: findResults
    })

    const hasRun = await cleanupSeedData(mockDb, {
      isProduction: PRODUCTION,
      isDryRun: ACTUAL_RUN
    })

    expect(hasRun).toBeTruthy()

    expect(deletions).toContainEqual({
      collectionName: 'epr-organisations',
      query: {
        _id: {
          $in: EPR_ORGANISATION_FIXTURE_IDS
        }
      }
    })
    expect(deletions).toContainEqual({
      collectionName: 'organisation',
      query: {
        _id: {
          $in: ORGANISATION_FIXTURE_IDS
        }
      }
    })
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

    expect(deletions).toHaveLength(4)
  })

  it('does not attempt to delete anything (in production) when no candidate documents are found', async () => {
    const deletions = []

    const mockDb = createMockDb({
      deletions
    })

    const hasRun = await cleanupSeedData(mockDb, {
      isProduction: PRODUCTION,
      isDryRun: ACTUAL_RUN
    })

    expect(hasRun).toBeTruthy()
    expect(deletions).toHaveLength(0)
  })

  it('does not remove seed data in production on a dry run', async () => {
    const deletions = []
    const mockDb = createMockDb({
      deletions,
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
    const deletions = []
    const mockDb = createMockDb({
      deletions,
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
  deletions = [],
  countDocuments = async () => 0,
  find = () => ({ toArray: async () => [] }),
  insertions = []
}) {
  return {
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
