import { describe, it, expect, vi, beforeEach } from 'vitest'
import { aggregateTonnageByMaterial } from './aggregate-tonnage.js'

const createMockDb = (aggregateResults) => ({
  collection: vi.fn(() => ({
    aggregate: vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue(aggregateResults)
    }))
  }))
})

describe('aggregateTonnageByMaterial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return tonnage grouped by material', async () => {
    const mockResults = [
      { _id: 'glass', totalTonnage: 100.5 },
      { _id: 'plastic', totalTonnage: 250.75 }
    ]
    const db = createMockDb(mockResults)

    const result = await aggregateTonnageByMaterial(db)

    expect(result.materials).toEqual(
      expect.arrayContaining([
        { material: 'glass', totalTonnage: 100.5 },
        { material: 'plastic', totalTonnage: 250.75 }
      ])
    )
    expect(result.total).toBe(351.25)
    expect(result.generatedAt).toBeDefined()
  })

  it('should return zero tonnage for materials with no records', async () => {
    const mockResults = [{ _id: 'glass', totalTonnage: 50 }]
    const db = createMockDb(mockResults)

    const result = await aggregateTonnageByMaterial(db)

    const plasticEntry = result.materials.find((m) => m.material === 'plastic')
    expect(plasticEntry.totalTonnage).toBe(0)
  })

  it('should include all material types in response', async () => {
    const db = createMockDb([])

    const result = await aggregateTonnageByMaterial(db)

    const expectedMaterials = [
      'aluminium',
      'fibre',
      'glass',
      'paper',
      'plastic',
      'steel',
      'wood'
    ]
    const actualMaterials = result.materials.map((m) => m.material)
    expect(actualMaterials.sort()).toEqual(expectedMaterials.sort())
  })

  it('should query the waste-records collection', async () => {
    const db = createMockDb([])

    await aggregateTonnageByMaterial(db)

    expect(db.collection).toHaveBeenCalledWith('waste-records')
  })

  it('should return generatedAt timestamp', async () => {
    const db = createMockDb([])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('should calculate grand total correctly', async () => {
    const mockResults = [
      { _id: 'aluminium', totalTonnage: 10 },
      { _id: 'glass', totalTonnage: 20 },
      { _id: 'plastic', totalTonnage: 30 }
    ]
    const db = createMockDb(mockResults)

    const result = await aggregateTonnageByMaterial(db)

    expect(result.total).toBe(60)
  })
})
