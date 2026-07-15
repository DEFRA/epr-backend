import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { aggregateTonnageByMaterial } from './aggregate-tonnage.js'
import { SUMMARY_LOG_ROW_STATES_COLLECTION_NAME } from '#waste-records/repository/mongodb.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'

const createMockDb = (
  aggregateResults,
  latestSubmittedSummaryLogs = [{ summaryLogId: 'sl-1' }]
) => ({
  collection: vi.fn((name) => ({
    aggregate: vi.fn(() => ({
      toArray: vi
        .fn()
        .mockResolvedValue(
          name === WASTE_BALANCE_EVENTS_COLLECTION_NAME
            ? latestSubmittedSummaryLogs
            : aggregateResults
        )
    }))
  }))
})

describe('aggregateTonnageByMaterial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return tonnage grouped by material, year, and type with months array', async () => {
    vi.setSystemTime(new Date('2026-02-15T10:00:00.000Z'))

    const mockResults = [
      {
        material: 'glass_re_melt',
        year: 2026,
        month: 'Jan',
        monthNumber: 1,
        type: 'Exporter',
        totalTonnage: 100.5
      },
      {
        material: 'plastic',
        year: 2026,
        month: 'Feb',
        monthNumber: 2,
        type: 'Reprocessor',
        totalTonnage: 250.75
      }
    ]
    const db = createMockDb(mockResults)

    const result = await aggregateTonnageByMaterial(db)

    // Should return 8 materials × 2 types = 16 entries (each with 2 months)
    expect(result.materials).toHaveLength(16)

    // Find and verify glass_re_melt Exporter
    const glassExporter = result.materials.find(
      (m) => m.material === 'glass_re_melt' && m.type === 'Exporter'
    )
    expect(glassExporter).toEqual({
      material: 'glass_re_melt',
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 100.5 },
        { month: 'Feb', tonnage: 0 }
      ]
    })

    // Find and verify plastic Reprocessor
    const plasticReprocessor = result.materials.find(
      (m) => m.material === 'plastic' && m.type === 'Reprocessor'
    )
    expect(plasticReprocessor).toEqual({
      material: 'plastic',
      year: 2026,
      type: 'Reprocessor',
      months: [
        { month: 'Jan', tonnage: 0 },
        { month: 'Feb', tonnage: 250.75 }
      ]
    })

    expect(result.total).toBe(351.25)
    expect(result.generatedAt).toBeDefined()
  })

  it('should handle multiple entries for same material in different months', async () => {
    vi.setSystemTime(new Date('2026-02-15T10:00:00.000Z'))

    const mockResults = [
      {
        material: 'plastic',
        year: 2026,
        month: 'Jan',
        monthNumber: 1,
        type: 'Exporter',
        totalTonnage: 100
      },
      {
        material: 'plastic',
        year: 2026,
        month: 'Feb',
        monthNumber: 2,
        type: 'Exporter',
        totalTonnage: 50
      }
    ]
    const db = createMockDb(mockResults)

    const result = await aggregateTonnageByMaterial(db)

    // 8 materials × 2 types = 16 entries
    expect(result.materials).toHaveLength(16)
    expect(result.total).toBe(150)

    // Verify plastic Exporter has correct values in both months
    const plasticExporter = result.materials.find(
      (m) => m.material === 'plastic' && m.type === 'Exporter'
    )
    expect(plasticExporter).toEqual({
      material: 'plastic',
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 100 },
        { month: 'Feb', tonnage: 50 }
      ]
    })

    // Verify plastic Reprocessor has 0 tonnage (type not present in data)
    const plasticReprocessor = result.materials.find(
      (m) => m.material === 'plastic' && m.type === 'Reprocessor'
    )
    expect(plasticReprocessor).toEqual({
      material: 'plastic',
      year: 2026,
      type: 'Reprocessor',
      months: [
        { month: 'Jan', tonnage: 0 },
        { month: 'Feb', tonnage: 0 }
      ]
    })

    // Verify other materials have 0 tonnage
    const aluminiumExporter = result.materials.find(
      (m) => m.material === 'aluminium' && m.type === 'Exporter'
    )
    expect(aluminiumExporter).toEqual({
      material: 'aluminium',
      year: 2026,
      type: 'Exporter',
      months: [
        { month: 'Jan', tonnage: 0 },
        { month: 'Feb', tonnage: 0 }
      ]
    })
  })

  it('should return generatedAt timestamp', async () => {
    const db = createMockDb([])

    const result = await aggregateTonnageByMaterial(db)

    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('should return tonnage for glass_other and glass_re_melt with year and type', async () => {
    vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'))

    const mockResults = [
      {
        material: 'glass_other',
        year: 2026,
        month: 'Jan',
        monthNumber: 1,
        type: 'Reprocessor',
        totalTonnage: 75
      },
      {
        material: 'glass_re_melt',
        year: 2026,
        month: 'Jan',
        monthNumber: 1,
        type: 'Exporter',
        totalTonnage: 125
      }
    ]
    const db = createMockDb(mockResults)

    const result = await aggregateTonnageByMaterial(db)

    // Find and verify glass_other Reprocessor
    const glassOtherReprocessor = result.materials.find(
      (m) => m.material === 'glass_other' && m.type === 'Reprocessor'
    )
    expect(glassOtherReprocessor).toEqual({
      material: 'glass_other',
      year: 2026,
      type: 'Reprocessor',
      months: [{ month: 'Jan', tonnage: 75 }]
    })

    // Find and verify glass_re_melt Exporter
    const glassReMeltExporter = result.materials.find(
      (m) => m.material === 'glass_re_melt' && m.type === 'Exporter'
    )
    expect(glassReMeltExporter).toEqual({
      material: 'glass_re_melt',
      year: 2026,
      type: 'Exporter',
      months: [{ month: 'Jan', tonnage: 125 }]
    })

    expect(result.total).toBe(200)
  })

  it('should calculate grand total correctly', async () => {
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))

    const mockResults = [
      {
        material: 'aluminium',
        year: 2026,
        month: 'Jan',
        monthNumber: 1,
        type: 'Exporter',
        totalTonnage: 10
      },
      {
        material: 'glass_re_melt',
        year: 2026,
        month: 'Feb',
        monthNumber: 2,
        type: 'Reprocessor',
        totalTonnage: 20
      },
      {
        material: 'plastic',
        year: 2026,
        month: 'Mar',
        monthNumber: 3,
        type: 'Exporter',
        totalTonnage: 30
      }
    ]
    const db = createMockDb(mockResults)

    const result = await aggregateTonnageByMaterial(db)

    expect(result.total).toBe(60)
  })

  it('filters row states to the latest submitted summary logs resolved from the ledger', async () => {
    const aggregateCalls = []
    const db = {
      collection: vi.fn((name) => ({
        aggregate: vi.fn((pipeline) => {
          aggregateCalls.push({ name, pipeline })
          return {
            toArray: vi
              .fn()
              .mockResolvedValue(
                name === WASTE_BALANCE_EVENTS_COLLECTION_NAME
                  ? [{ summaryLogId: 'sl-1' }, { summaryLogId: 'sl-2' }]
                  : []
              )
          }
        })
      }))
    }

    await aggregateTonnageByMaterial(db)

    const rowStatesCall = aggregateCalls.find(
      (call) => call.name === SUMMARY_LOG_ROW_STATES_COLLECTION_NAME
    )
    expect(rowStatesCall.pipeline[0].$match.summaryLogIds).toEqual({
      $in: ['sl-1', 'sl-2']
    })
  })
})
