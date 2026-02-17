import { ObjectId } from 'mongodb'
import { describe, test, expect, vi } from 'vitest'

import { createPrnVisibilityFilter } from './prn-visibility-filter.js'

/**
 * Creates a mock MongoDB Db that returns the given documents
 * from the epr-organisations collection.
 *
 * @param {object[]} docs - Documents to return from find().toArray()
 */
function createMockDb(docs = []) {
  const toArray = vi.fn().mockResolvedValue(docs)
  const find = vi.fn().mockReturnValue({ toArray })
  const collection = vi.fn().mockReturnValue({ find })

  return { collection, find, toArray }
}

describe('#createPrnVisibilityFilter', () => {
  test('returns empty excludeOrganisationIds when no test org IDs provided', async () => {
    const { collection } = createMockDb()

    const prnVisibilityFilter = await createPrnVisibilityFilter(
      { collection },
      { testOrganisationIds: [] }
    )

    expect(prnVisibilityFilter.excludeOrganisationIds).toEqual([])
    expect(collection).not.toHaveBeenCalled()
  })

  test('resolves numeric orgIds to MongoDB _id hex strings', async () => {
    const org500521Id = new ObjectId()
    const org500002Id = new ObjectId()
    const mockDb = createMockDb([
      { _id: org500521Id, orgId: 500521 },
      { _id: org500002Id, orgId: 500002 }
    ])

    const prnVisibilityFilter = await createPrnVisibilityFilter(
      { collection: mockDb.collection },
      { testOrganisationIds: [500521, 500002] }
    )

    expect(mockDb.collection).toHaveBeenCalledWith('epr-organisations')
    expect(mockDb.find).toHaveBeenCalledWith(
      { orgId: { $in: [500521, 500002] } },
      { projection: { _id: 1 } }
    )
    expect(prnVisibilityFilter.excludeOrganisationIds).toEqual([
      org500521Id.toHexString(),
      org500002Id.toHexString()
    ])
  })

  test('returns empty excludeOrganisationIds when no orgs found in DB', async () => {
    const mockDb = createMockDb([])

    const prnVisibilityFilter = await createPrnVisibilityFilter(
      { collection: mockDb.collection },
      { testOrganisationIds: [999999] }
    )

    expect(prnVisibilityFilter.excludeOrganisationIds).toEqual([])
  })

  test('returns only found org IDs when some are missing', async () => {
    const org500521Id = new ObjectId()
    const mockDb = createMockDb([{ _id: org500521Id, orgId: 500521 }])

    const prnVisibilityFilter = await createPrnVisibilityFilter(
      { collection: mockDb.collection },
      { testOrganisationIds: [500521, 999999] }
    )

    expect(prnVisibilityFilter.excludeOrganisationIds).toEqual([
      org500521Id.toHexString()
    ])
  })
})
