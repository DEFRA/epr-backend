import { describe, it, expect } from 'vitest'
import { Decimal128 } from 'mongodb'
import {
  buildEffectiveMaterialStages,
  formatMaterialResults
} from './material-aggregation.js'

describe('material-aggregation', () => {
  describe('buildEffectiveMaterialStages', () => {
    it('should return an array of pipeline stages', () => {
      const stages = buildEffectiveMaterialStages()

      expect(stages).toBeInstanceOf(Array)
      expect(stages).toHaveLength(4)
    })

    it('should extract orgData fields in the first stage', () => {
      const stages = buildEffectiveMaterialStages()
      const addFieldsStage = stages[0]

      expect(addFieldsStage.$addFields).toEqual({
        orgId: { $arrayElemAt: ['$orgData.orgId', 0] },
        material: { $arrayElemAt: ['$orgData.material', 0] },
        glassRecyclingProcess: {
          $arrayElemAt: ['$orgData.glassRecyclingProcess', 0]
        }
      })
    })

    it('should filter out test organisations', () => {
      const stages = buildEffectiveMaterialStages()
      const matchStage = stages[1]

      expect(matchStage.$match.orgId).toHaveProperty('$nin')
    })

    it('should filter out null materials', () => {
      const stages = buildEffectiveMaterialStages()
      const matchStage = stages[2]

      expect(matchStage).toEqual({ $match: { material: { $ne: null } } })
    })

    it('should calculate effective material with glass handling', () => {
      const stages = buildEffectiveMaterialStages()
      const effectiveMaterialStage = stages[3]

      expect(
        effectiveMaterialStage.$addFields.effectiveMaterial.$cond
      ).toBeDefined()
    })
  })

  describe('formatMaterialResults', () => {
    it('should map results to all materials with the given value field', () => {
      const results = [
        { _id: 'plastic', totalTonnage: 100 },
        { _id: 'paper', totalTonnage: 200 }
      ]

      const { materials } = formatMaterialResults(results, 'totalTonnage')

      const plastic = materials.find((m) => m.material === 'plastic')
      const paper = materials.find((m) => m.material === 'paper')

      expect(plastic.totalTonnage).toBe(100)
      expect(paper.totalTonnage).toBe(200)
    })

    it('should default missing materials to zero', () => {
      const results = [{ _id: 'plastic', availableAmount: 50 }]

      const { materials } = formatMaterialResults(results, 'availableAmount')

      const wood = materials.find((m) => m.material === 'wood')
      expect(wood.availableAmount).toBe(0)
    })

    it('should include all expected materials', () => {
      const { materials } = formatMaterialResults([], 'totalTonnage')

      const materialNames = materials.map((m) => m.material)
      expect(materialNames.sort()).toEqual([
        'aluminium',
        'fibre',
        'glass_other',
        'glass_re_melt',
        'paper',
        'plastic',
        'steel',
        'wood'
      ])
    })

    it('should calculate the total across all materials', () => {
      const results = [
        { _id: 'aluminium', totalTonnage: 10 },
        { _id: 'plastic', totalTonnage: 30 }
      ]

      const { total } = formatMaterialResults(results, 'totalTonnage')

      expect(total).toBe(40)
    })

    it('should convert Decimal128 values to numbers', () => {
      const results = [
        { _id: 'aluminium', totalTonnage: Decimal128.fromString('1.25') },
        { _id: 'plastic', totalTonnage: Decimal128.fromString('2.75') }
      ]

      const { materials, total } = formatMaterialResults(
        results,
        'totalTonnage'
      )

      const aluminium = materials.find((m) => m.material === 'aluminium')
      const plastic = materials.find((m) => m.material === 'plastic')

      expect(aluminium.totalTonnage).toBe(1.25)
      expect(plastic.totalTonnage).toBe(2.75)
      expect(total).toBe(4)
    })

    it('should return zero total when no results', () => {
      const { total } = formatMaterialResults([], 'availableAmount')

      expect(total).toBe(0)
    })
  })
})
