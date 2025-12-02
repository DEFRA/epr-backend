import { describe, it, expect } from 'vitest'
import { createSeedData } from './create-update'
import { ObjectId } from 'mongodb'

const PRODUCTION = () => true
const NON_PRODUCTION = () => false

describe('createSeedData', () => {
  it('does not create seed data in production', async () => {
    const { mockDb, insertions } = createMockDb({
      countDocuments: async () => 0
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
      const { mockDb, insertions } = createMockDb({
        countDocuments: async () => 0
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
      const { mockDb, insertions } = createMockDb({
        countDocuments: async () => 1
      })
      await createSeedData(mockDb, NON_PRODUCTION)

      expect(
        insertions.map((insertion) => insertion.collectionName)
      ).not.toContain(collectionName)
    }
  )

  it('does not create epr-organisation seed data when the fixtures are already present in the collection ', async () => {
    const { mockDb, insertions } = createMockDb({
      countDocuments: async () => 1,
      find: (_query) => ({
        toArray: async () => [
          ObjectId.createFromHexString('6507f1f77bcf86cd79943901')
        ]
      })
    })
    await createSeedData(mockDb, NON_PRODUCTION)

    expect(
      insertions.map((insertion) => insertion.collectionName)
    ).not.toContain('epr-organisations')
  })
})

function createMockDb({
  countDocuments = async () => 0,
  find = () => ({ toArray: async () => [] })
}) {
  const insertions = []
  return {
    insertions,
    mockDb: {
      collection: (collectionName) => ({
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
