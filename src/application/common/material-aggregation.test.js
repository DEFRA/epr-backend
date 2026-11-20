import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { assertPresent } from '#test/type-helpers.js'
import { Decimal128 } from 'mongodb'
import {
  formatMaterialResults,
  formatTonnageMonitoringResults
} from './material-aggregation.js'
import { TONNAGE_MONITORING_MATERIALS } from '#domain/organisations/model.js'
import { toYear } from '#common/helpers/dates/year.js'

/**
 * `formatMaterialResults` keys the metric dynamically (`totalTonnage` /
 * `availableAmount`), so the returned entries can't be statically typed. This
 * narrows a looked-up entry to the metric fields the tests assert on.
 *
 * @param {Array<{ material: string }>} materials
 * @param {string} material
 * @returns {{ totalTonnage: number, availableAmount: number }}
 */
const findMaterial = (materials, material) => {
  const found = materials.find((m) => m.material === material)
  assertPresent(found)
  return /** @type {{ totalTonnage: number, availableAmount: number }} */ (
    /** @type {unknown} */ (found)
  )
}

describe('material-aggregation', () => {
  describe('formatMaterialResults', () => {
    it('should map results to all materials with the given value field', () => {
      const results = [
        { material: 'plastic', totalTonnage: 100 },
        { material: 'paper', totalTonnage: 200 }
      ]

      const { materials } = formatMaterialResults(results, 'totalTonnage')

      const plastic = findMaterial(materials, 'plastic')
      const paper = findMaterial(materials, 'paper')

      expect(plastic.totalTonnage).toBe(100)
      expect(paper.totalTonnage).toBe(200)
    })

    it('should default missing materials to zero', () => {
      const results = [{ material: 'plastic', availableAmount: 50 }]

      const { materials } = formatMaterialResults(results, 'availableAmount')

      const wood = findMaterial(materials, 'wood')
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
        { material: 'aluminium', totalTonnage: 10 },
        { material: 'plastic', totalTonnage: 30 }
      ]

      const { total } = formatMaterialResults(results, 'totalTonnage')

      expect(total).toBe(40)
    })

    it('should convert Decimal128 values to numbers', () => {
      const results = [
        { material: 'aluminium', totalTonnage: Decimal128.fromString('1.25') },
        { material: 'plastic', totalTonnage: Decimal128.fromString('2.75') }
      ]

      const { materials, total } = formatMaterialResults(
        results,
        'totalTonnage'
      )

      const aluminium = findMaterial(materials, 'aluminium')
      const plastic = findMaterial(materials, 'plastic')

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

      const result = formatTonnageMonitoringResults([], toYear(2026))

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

      const result = formatTonnageMonitoringResults(results, toYear(2026))

      // 8 materials × 2 types = 16 entries
      expect(result.materials).toHaveLength(16)
      expect(result.total).toBe(100)

      const plasticExporter = result.materials.find(
        (m) => m.material === 'plastic' && m.type === 'Exporter'
      )
      assertPresent(plasticExporter)

      expect(plasticExporter.year).toBe(2026)
      expect(plasticExporter.months).toHaveLength(1)

      expect(plasticExporter.months[0].month).toBe('Jan')
      expect(plasticExporter.months[0].tonnage).toBe(100)

      const aluminiumExporter = result.materials.find(
        (m) => m.material === 'aluminium' && m.type === 'Exporter'
      )
      assertPresent(aluminiumExporter)

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

      const result = formatTonnageMonitoringResults(results, toYear(2026))

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
      assertPresent(plasticExporter)

      expect(plasticExporter.months).toEqual([
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 0 }
      ])

      const aluminiumReprocessor = result.materials.find(
        (m) => m.material === 'aluminium' && m.type === 'Reprocessor'
      )
      assertPresent(aluminiumReprocessor)

      expect(aluminiumReprocessor.months).toEqual([
        { month: 'Jan', tonnage: 0 },
        { month: 'Feb', tonnage: 50 }
      ])
    })

    it('should sort results by type (DESC), then material (ASC)', () => {
      vi.setSystemTime(new Date('2027-02-15T10:00:00.000Z'))

      const { materials } = formatTonnageMonitoringResults([], toYear(2027))

      expect(materials[0]).toMatchObject({
        type: 'Reprocessor',
        material: 'aluminium'
      })
      expect(materials[7]).toMatchObject({
        type: 'Reprocessor',
        material: 'wood'
      })
      expect(materials[8]).toMatchObject({
        type: 'Exporter',
        material: 'aluminium'
      })
    })

    it('reports a year opened early for every month, with its tonnage, before that year begins', () => {
      vi.setSystemTime(new Date('2026-11-20T09:00:00.000Z'))

      const { materials, total } = formatTonnageMonitoringResults(
        [
          {
            material: 'paper',
            year: 2027,
            monthNumber: 1,
            type: 'Reprocessor',
            totalTonnage: 40
          }
        ],
        toYear(2027)
      )

      const paperReprocessor = materials.find(
        (m) => m.material === 'paper' && m.type === 'Reprocessor'
      )
      assertPresent(paperReprocessor)
      expect(paperReprocessor.year).toBe(2027)
      expect(paperReprocessor.months).toHaveLength(12)
      expect(paperReprocessor.months[0]).toEqual({ month: 'Jan', tonnage: 40 })
      expect(total).toBe(40)
    })

    it('leaves out tonnage of any other year', () => {
      vi.setSystemTime(new Date('2027-02-15T10:00:00.000Z'))

      const { materials, total } = formatTonnageMonitoringResults(
        [
          {
            material: 'paper',
            year: 2026,
            monthNumber: 1,
            type: 'Reprocessor',
            totalTonnage: 40
          }
        ],
        toYear(2027)
      )

      expect(new Set(materials.map(({ year }) => year))).toEqual(
        new Set([2027])
      )
      expect(total).toBe(0)
    })
  })
})
