import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { aggregatePrnTonnage } from './aggregate-prn-tonnage.js'

describe('aggregatePrnTonnage', () => {
  const mockToArray = vi.fn()
  const mockAggregate = vi.fn(() => ({
    toArray: mockToArray
  }))
  const mockCollection = vi.fn(() => ({
    aggregate: mockAggregate
  }))

  const db = {
    collection: mockCollection
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds aggregation pipeline and returns generatedAt with rows', async () => {
    const rows = [
      {
        organisationName: 'ACME ltd',
        organisationId: '50020',
        accreditationNumber: 'ACC-50020-001',
        material: 'glass',
        tonnageBand: 'over_10000',
        awaitingAuthorisationTonnage: 4,
        awaitingAcceptanceTonnage: 28,
        awaitingCancellationTonnage: 0,
        acceptedTonnage: 0,
        cancelledTonnage: 11
      }
    ]
    mockToArray.mockResolvedValue(rows)

    const result = await aggregatePrnTonnage(db)

    expect(mockCollection).toHaveBeenCalledWith('packaging-recycling-notes')
    expect(mockAggregate).toHaveBeenCalledTimes(1)

    const pipeline = mockAggregate.mock.calls[0][0]
    expect(Array.isArray(pipeline)).toBe(true)
    expect(pipeline[0]).toEqual({
      $match: {
        'status.currentStatus': {
          $nin: [PRN_STATUS.DELETED, PRN_STATUS.DISCARDED]
        }
      }
    })

    expect(pipeline[1].$group).toHaveProperty('awaitingAuthorisationTonnage')
    expect(pipeline[1].$group).toHaveProperty('awaitingAcceptanceTonnage')
    expect(pipeline[1].$group).toHaveProperty('awaitingCancellationTonnage')
    expect(pipeline[1].$group).toHaveProperty('acceptedTonnage')
    expect(pipeline[1].$group).toHaveProperty('cancelledTonnage')
    expect(pipeline[1].$group).not.toHaveProperty('createdTonnage')
    expect(pipeline[1].$group).not.toHaveProperty('issuedTonnage')

    expect(result.rows).toEqual(rows)
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
