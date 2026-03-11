import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Decimal128 } from 'mongodb'
import {
  buildEffectiveMaterialStages,
  formatMaterialResults,
  formatTonnageMonitoringResults
} from './material-aggregation.js'
import { TONNAGE_MONITORING_MATERIALS } from '#domain/organisations/model.js'

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

  describe('formatTonnageMonitoringResults', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return all materials and types with zero tonnage when no results', () => {
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'))

      const result = formatTonnageMonitoringResults([])

      // 8 materials × 2 types = 16 entries
      expect(result.materials).toHaveLength(16)
      expect(result.total).toBe(0)

      result.materials.forEach((entry) => {
        expect(entry).toMatchObject({
          year: 2026,
          months: [{ month: 'Jan', tonnage: 0 }]
        })
        expect(TONNAGE_MONITORING_MATERIALS).toContain(entry.material)
        expect(['Exporter', 'Reprocessor']).toContain(entry.type)
      })

      const materials = [...new Set(result.materials.map((m) => m.material))]
      expect(materials.sort()).toEqual([
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

    it('should fill missing materials and types with zero tonnage for single month', () => {
      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'))

      const results = [
        {
          material: 'plastic',
          year: 2026,
          monthNumber: 1,
          month: 'Jan',
          type: 'Exporter',
          totalTonnage: 100
        }
      ]

      const result = formatTonnageMonitoringResults(results)

      // 8 materials × 2 types = 16 entries
      expect(result.materials).toHaveLength(16)
      expect(result.total).toBe(100)

      const plasticExporter = result.materials.find(
        (m) => m.material === 'plastic' && m.type === 'Exporter'
      )
      expect(plasticExporter).toBeDefined()
      expect(plasticExporter.year).toBe(2026)
      expect(plasticExporter.months).toHaveLength(1)

      expect(plasticExporter.months[0].month).toBe('Jan')
      expect(plasticExporter.months[0].tonnage).toBe(100)

      const aluminiumExporter = result.materials.find(
        (m) => m.material === 'aluminium' && m.type === 'Exporter'
      )
      aluminiumExporter.months.forEach((m) => {
        expect(m.tonnage).toBe(0)
      })
    })

    it('should calculate total and fill missing data for multiple months', () => {
      vi.setSystemTime(new Date('2026-02-15T10:00:00.000Z'))

      const results = [
        {
          material: 'plastic',
          year: 2026,
          monthNumber: 1,
          month: 'Jan',
          type: 'Exporter',
          totalTonnage: 100
        },
        {
          material: 'aluminium',
          year: 2026,
          monthNumber: 2,
          month: 'Feb',
          type: 'Reprocessor',
          totalTonnage: 50
        }
      ]

      const result = formatTonnageMonitoringResults(results)

      // 8 materials × 2 types = 16 entries (each with 2 months)
      expect(result.materials).toHaveLength(16)
      expect(result.total).toBe(150)

      result.materials.forEach((entry) => {
        expect(entry.months).toHaveLength(2)
        expect(entry.months.map((m) => m.month)).toEqual(['Jan', 'Feb'])
      })

      const plasticExporter = result.materials.find(
        (m) => m.material === 'plastic' && m.type === 'Exporter'
      )
      expect(plasticExporter.months).toEqual([
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 }
      ])

      const aluminiumReprocessor = result.materials.find(
        (m) => m.material === 'aluminium' && m.type === 'Reprocessor'
      )
      expect(aluminiumReprocessor.months).toEqual([
        { month: 'Jan', tonnage: 0 },
        { month: 'Feb', tonnage: 50 }
      ])
    })
  })

  it('should sort results by year (DESC), type (DESC), and material (ASC)', () => {
    vi.setSystemTime(new Date('2027-02-15T10:00:00.000Z'))

    const results = [
      {
        material: 'aluminium',
        year: 2027,
        month: 'Jan',
        type: 'Exporter',
        totalTonnage: 150
      },
      {
        material: 'wood',
        year: 2027,
        month: 'Feb',
        type: 'Reprocessor',
        totalTonnage: 200
      }
    ]

    const { materials } = formatTonnageMonitoringResults(results)

    expect(materials[0]).toMatchObject({
      year: 2027,
      type: 'Reprocessor',
      material: 'aluminium'
    })

    expect(materials[7]).toMatchObject({
      year: 2027,
      type: 'Reprocessor',
      material: 'wood'
    })
    expect(materials[8]).toMatchObject({
      year: 2027,
      type: 'Exporter',
      material: 'aluminium'
    })
  })
})
