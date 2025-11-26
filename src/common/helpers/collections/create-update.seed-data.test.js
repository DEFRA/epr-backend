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

const IS_PRODUCTION = () => true
const IS_NOT_PRODUCTION = () => false

describe('seed data', () => {
  describe('environment is production', () => {
    it('does not create seed data', async () => {
      const mockDb = createMockDb({
        countDocuments: async () => 0
      })
      await createSeedData(mockDb, IS_PRODUCTION)
    })

    it('deletes fixture data', async () => {
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

      await cleanupSeedData(mockDb, IS_PRODUCTION)

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

      await cleanupSeedData(mockDb, IS_PRODUCTION)

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
  })

  describe('environment is not production', () => {
    it('creates seed data when there are no documents already in each collection ', async () => {
      const insertions = []
      const mockDb = createMockDb({
        countDocuments: async () => 0,
        insertions
      })
      await createSeedData(mockDb, IS_NOT_PRODUCTION)

      expect(insertions.map((insertion) => insertion.collectionName)).toEqual([
        'organisation',
        'registration',
        'accreditation',
        'epr-organisations'
      ])
    })

    it('does not create seed data when there are already documents in each collection ', async () => {
      const insertions = []
      const mockDb = createMockDb({
        countDocuments: async () => 1,
        insertions
      })
      await createSeedData(mockDb, IS_NOT_PRODUCTION)

      expect(insertions).toHaveLength(0)
    })

    it('does not remove seed data', async () => {
      const deletions = []
      const mockDb = createMockDb({ deletions })
      await cleanupSeedData(mockDb, IS_NOT_PRODUCTION)

      expect(deletions).toHaveLength(0)
    })
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
