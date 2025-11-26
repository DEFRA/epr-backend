import { describe, it, expect } from 'vitest'
import { cleanupSeedData, createSeedData } from './create-update'
import { ObjectId } from 'mongodb'

const ORGANISATION_FIXTURE_ID = ObjectId.createFromHexString(
  '000011112222333344440000'
)
const REGISTRATION_FIXTURE_ID = ObjectId.createFromHexString(
  '000011112222333344441111'
)
const ACCREDITATION_FIXTURE_ID = ObjectId.createFromHexString(
  '000011112222333344442222'
)

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
  it('deletes fixture data in production', async () => {
    const deletions = []

    const findResults = (query) => {
      let results = []

      if (query.orgName === 'ACME ltd' && query.email === 'alice@foo.com') {
        results = [{ _id: ORGANISATION_FIXTURE_ID }]
      }

      if (
        query['rawSubmissionData.data.main.RIXIzA'] ===
        '68a66ec3dabf09f3e442b2da'
      ) {
        results = [{ _id: REGISTRATION_FIXTURE_ID }]
      }

      if (
        query['rawSubmissionData.data.main.MyWHms'] ===
        '68a66ec3dabf09f3e442b2da'
      ) {
        results = [{ _id: ACCREDITATION_FIXTURE_ID }]
      }

      return {
        toArray: async () => results
      }
    }

    const mockDb = createMockDb({ deletions, find: findResults })

    await cleanupSeedData(mockDb, PRODUCTION)

    expect(deletions).toContainEqual({
      collectionName: 'organisation',
      query: {
        _id: {
          $in: [ORGANISATION_FIXTURE_ID]
        }
      }
    })

    expect(deletions).toContainEqual({
      collectionName: 'registration',
      query: {
        _id: {
          $in: [REGISTRATION_FIXTURE_ID]
        }
      }
    })

    expect(deletions).toContainEqual({
      collectionName: 'accreditation',
      query: {
        _id: {
          $in: [ACCREDITATION_FIXTURE_ID]
        }
      }
    })

    expect(deletions).toContainEqual({
      collectionName: 'epr-organisations',
      query: {
        _id: {
          $in: [
            // IDs of the four epr-organisation fixtures
            ObjectId.createFromHexString('6507f1f77bcf86cd79943901'),
            ObjectId.createFromHexString('6507f1f77bcf86cd79943921'),
            ObjectId.createFromHexString('6507f1f77bcf86cd79943931'),
            ObjectId.createFromHexString('6507f1f77bcf86cd79943911')
          ]
        }
      }
    })

    expect(deletions).toHaveLength(4)
  })

  it('does not delete when more than one fixture found in organisation/registration/accreditation collection', async () => {
    const deletions = []

    const findResults = (query) => {
      let results = []

      if (query.orgName === 'ACME ltd' && query.email === 'alice@foo.com') {
        results = [
          { _id: ORGANISATION_FIXTURE_ID },
          { _id: ORGANISATION_FIXTURE_ID }
        ]
      }

      return {
        toArray: async () => results
      }
    }

    const mockDb = createMockDb({ deletions, find: findResults })

    await cleanupSeedData(mockDb, PRODUCTION)

    expect(deletions).toContainEqual({
      collectionName: 'epr-organisations',
      query: {
        _id: {
          $in: [
            // IDs of the four epr-organisation fixtures
            ObjectId.createFromHexString('6507f1f77bcf86cd79943901'),
            ObjectId.createFromHexString('6507f1f77bcf86cd79943921'),
            ObjectId.createFromHexString('6507f1f77bcf86cd79943931'),
            ObjectId.createFromHexString('6507f1f77bcf86cd79943911')
          ]
        }
      }
    })

    expect(deletions).toHaveLength(1)
  })

  it('does not remove seed data when in environments that are not production', async () => {
    const deletions = []
    const mockDb = createMockDb({ deletions })
    await cleanupSeedData(mockDb, NON_PRODUCTION)

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
