import { describe, it, expect, vi, beforeEach } from 'vitest'
import { aggregateAvailableBalance } from './aggregate-available-balance.js'

const createMockDb = (aggregateResults) => ({
  collection: vi.fn(() => ({
    aggregate: vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue(aggregateResults)
    }))
  }))
})

describe('aggregateAvailableBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return available balance grouped by material', async () => {
    const mockResults = [
      { _id: 'glass_re_melt', availableAmount: 100.5 },
      { _id: 'plastic', availableAmount: 250.75 }
    ]
    const db = createMockDb(mockResults)

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toEqual(
      expect.arrayContaining([
        { material: 'glass_re_melt', availableAmount: 100.5 },
        { material: 'plastic', availableAmount: 250.75 }
      ])
    )
    expect(result.total).toBe(351.25)
    expect(result.generatedAt).toBeDefined()
  })

  it('should return zero for materials with no balances', async () => {
    const mockResults = [{ _id: 'glass_re_melt', availableAmount: 50 }]
    const db = createMockDb(mockResults)

    const result = await aggregateAvailableBalance(db)

    const plasticEntry = result.materials.find((m) => m.material === 'plastic')
    expect(plasticEntry.availableAmount).toBe(0)
  })

  it('should include all material types in response', async () => {
    const db = createMockDb([])

    const result = await aggregateAvailableBalance(db)

    const expectedMaterials = [
      'aluminium',
      'fibre',
      'glass_other',
      'glass_re_melt',
      'paper',
      'plastic',
      'steel',
      'wood'
    ]
    const actualMaterials = result.materials.map((m) => m.material)
    expect(actualMaterials.sort()).toEqual(expectedMaterials.sort())
  })

  it('should return generatedAt timestamp', async () => {
    const db = createMockDb([])

    const result = await aggregateAvailableBalance(db)

    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('should return balance for glass_other', async () => {
    const mockResults = [
      { _id: 'glass_other', availableAmount: 75 },
      { _id: 'glass_re_melt', availableAmount: 125 }
    ]
    const db = createMockDb(mockResults)

    const result = await aggregateAvailableBalance(db)

    expect(result.materials).toEqual(
      expect.arrayContaining([
        { material: 'glass_other', availableAmount: 75 },
        { material: 'glass_re_melt', availableAmount: 125 }
      ])
    )
    expect(result.total).toBe(200)
  })

  it('should calculate grand total correctly', async () => {
    const mockResults = [
      { _id: 'aluminium', availableAmount: 10 },
      { _id: 'glass_re_melt', availableAmount: 20 },
      { _id: 'plastic', availableAmount: 30 }
    ]
    const db = createMockDb(mockResults)

    const result = await aggregateAvailableBalance(db)

    expect(result.total).toBe(60)
  })
})
