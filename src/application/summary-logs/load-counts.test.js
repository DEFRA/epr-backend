import {
  countByWasteBalanceInclusion,
  countByValidity,
  mergeLoads
} from './load-counts.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { RECORD_CHANGE } from './record-change.js'

/**
 * @typedef {import('#application/waste-records/transform-from-summary-log.js').ValidatedWasteRecord} ValidatedWasteRecord
 * @typedef {import('./record-change.js').RecordChange} RecordChange
 */

/**
 * @param {{ rowId: string, issues?: Array, outcome?: string }} options
 * @returns {ValidatedWasteRecord}
 */
const createValidatedWasteRecord = ({
  rowId,
  issues = [],
  outcome = ROW_OUTCOME.INCLUDED
}) =>
  /** @type {any} */ ({
    tableName: 'RECEIVED_LOADS_FOR_EXPORT',
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    record: {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId,
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {}
    },
    issues,
    outcome,
    change: 'created'
  })

/**
 * Builds waste records and their record-change map together from per-row specs.
 * Each spec's `change` is the row's classification against the latest submitted
 * summary log; the map is what the projections consume in place of the old
 * version-based derivation.
 *
 * @param {Array<{ change?: RecordChange, issues?: Array, outcome?: string }>} specs
 */
const build = (specs) => {
  const wasteRecords = specs.map((spec, i) =>
    createValidatedWasteRecord({ rowId: `row-${i + 1}`, ...spec })
  )
  const recordChanges = new Map(
    specs.map((spec, i) => [
      `${WASTE_RECORD_TYPE.RECEIVED}:row-${i + 1}`,
      spec.change ?? RECORD_CHANGE.ADDED
    ])
  )
  return { wasteRecords, recordChanges }
}

describe('countByWasteBalanceInclusion', () => {
  describe('with empty data', () => {
    it('returns empty structure when wasteRecords is empty', () => {
      const result = countByWasteBalanceInclusion({
        wasteRecords: [],
        recordChanges: new Map()
      })

      expect(result).toEqual({
        added: {
          included: { count: 0, rowIds: [] },
          excluded: { count: 0, rowIds: [] }
        },
        unchanged: {
          included: { count: 0, rowIds: [] },
          excluded: { count: 0, rowIds: [] }
        },
        adjusted: {
          included: { count: 0, rowIds: [] },
          excluded: { count: 0, rowIds: [] }
        }
      })
    })
  })

  describe('classification based on record change', () => {
    it('classifies an added row under added', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.added.included.count).toBe(1)
      expect(result.unchanged.included.count).toBe(0)
      expect(result.adjusted.included.count).toBe(0)
    })

    it('classifies an adjusted row under adjusted', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADJUSTED }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.adjusted.included.count).toBe(1)
      expect(result.added.included.count).toBe(0)
      expect(result.unchanged.included.count).toBe(0)
    })

    it('classifies an unchanged row under unchanged', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.UNCHANGED }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.unchanged.included.count).toBe(1)
      expect(result.added.included.count).toBe(0)
      expect(result.adjusted.included.count).toBe(0)
    })
  })

  describe('inclusion based on outcome', () => {
    it('classifies as included when outcome is INCLUDED', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.INCLUDED }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.added.included.rowIds).toHaveLength(1)
      expect(result.added.excluded.rowIds).toHaveLength(0)
    })

    it('classifies as excluded when outcome is EXCLUDED', () => {
      const { wasteRecords, recordChanges } = build([
        {
          change: RECORD_CHANGE.ADDED,
          outcome: ROW_OUTCOME.EXCLUDED,
          issues: [
            {
              severity: 'error',
              category: 'TECHNICAL',
              message: 'missing required field',
              code: 'MISSING_FIELD'
            }
          ]
        }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.added.excluded.rowIds).toHaveLength(1)
      expect(result.added.included.rowIds).toHaveLength(0)
    })

    it('classifies as excluded when outcome is REJECTED', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.REJECTED }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.added.excluded.rowIds).toHaveLength(1)
      expect(result.added.included.rowIds).toHaveLength(0)
    })
  })

  describe('mixed scenarios', () => {
    it('correctly classifies mixed records by inclusion', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.INCLUDED },
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.EXCLUDED },
        { change: RECORD_CHANGE.ADJUSTED, outcome: ROW_OUTCOME.INCLUDED },
        { change: RECORD_CHANGE.UNCHANGED, outcome: ROW_OUTCOME.INCLUDED },
        { change: RECORD_CHANGE.UNCHANGED, outcome: ROW_OUTCOME.EXCLUDED }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.added.included.rowIds).toHaveLength(1)
      expect(result.added.excluded.rowIds).toHaveLength(1)
      expect(result.unchanged.included.rowIds).toHaveLength(1)
      expect(result.unchanged.excluded.rowIds).toHaveLength(1)
      expect(result.adjusted.included.rowIds).toHaveLength(1)
      expect(result.adjusted.excluded.rowIds).toHaveLength(0)
    })
  })

  describe('counts IGNORED rows as excluded (suspended accreditation)', () => {
    it('counts IGNORED rows as excluded, not invisible', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.IGNORED },
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.INCLUDED }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.added.included.count).toBe(1)
      expect(result.added.excluded.count).toBe(1)
    })

    it('counts IGNORED added and adjusted rows as excluded, skips IGNORED unchanged rows', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.IGNORED },
        { change: RECORD_CHANGE.ADJUSTED, outcome: ROW_OUTCOME.IGNORED },
        { change: RECORD_CHANGE.UNCHANGED, outcome: ROW_OUTCOME.IGNORED },
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.INCLUDED }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.added.included.count).toBe(1)
      expect(result.added.excluded.count).toBe(1)
      expect(result.adjusted.included.count).toBe(0)
      expect(result.adjusted.excluded.count).toBe(1)
      expect(result.unchanged.included.count).toBe(0)
      expect(result.unchanged.excluded.count).toBe(0)
    })

    it('counts a re-uploaded row with changed dates (adjusted + IGNORED) as adjusted.excluded', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADJUSTED, outcome: ROW_OUTCOME.IGNORED }
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.adjusted.excluded.count).toBe(1)
      expect(result.adjusted.included.count).toBe(0)
      expect(result.added.excluded.count).toBe(0)
      expect(result.unchanged.excluded.count).toBe(0)
    })
  })

  describe('truncation', () => {
    it('truncates rowId arrays at 100 but totals reflect full count', () => {
      const { wasteRecords, recordChanges } = build(
        Array.from({ length: 150 }, () => ({ change: RECORD_CHANGE.ADDED }))
      )

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.added.included.rowIds).toHaveLength(100)
      expect(result.added.included.count).toBe(150)
      expect(result.added.included.rowIds[0]).toBe('row-1')
      expect(result.added.included.rowIds[99]).toBe('row-100')
    })

    it('truncates each category independently', () => {
      const { wasteRecords, recordChanges } = build([
        ...Array.from({ length: 120 }, () => ({
          change: RECORD_CHANGE.ADDED,
          outcome: ROW_OUTCOME.INCLUDED
        })),
        ...Array.from({ length: 120 }, () => ({
          change: RECORD_CHANGE.ADDED,
          outcome: ROW_OUTCOME.EXCLUDED,
          issues: [
            {
              severity: 'error',
              category: 'TECHNICAL',
              message: 'test',
              code: 'TEST_ERROR'
            }
          ]
        }))
      ])

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        recordChanges
      })

      expect(result.added.included.rowIds).toHaveLength(100)
      expect(result.added.excluded.rowIds).toHaveLength(100)
      expect(result.added.included.count).toBe(120)
      expect(result.added.excluded.count).toBe(120)
    })
  })
})

describe('countByValidity', () => {
  describe('with empty data', () => {
    it('returns empty structure when wasteRecords is empty', () => {
      const result = countByValidity({
        wasteRecords: [],
        recordChanges: new Map()
      })

      expect(result).toEqual({
        added: {
          valid: { count: 0, rowIds: [] },
          invalid: { count: 0, rowIds: [] }
        },
        unchanged: {
          valid: { count: 0, rowIds: [] },
          invalid: { count: 0, rowIds: [] }
        },
        adjusted: {
          valid: { count: 0, rowIds: [] },
          invalid: { count: 0, rowIds: [] }
        }
      })
    })
  })

  describe('classification based on record change', () => {
    it('classifies an added row under added', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED }
      ])

      const result = countByValidity({ wasteRecords, recordChanges })

      expect(result.added.valid.count).toBe(1)
      expect(result.unchanged.valid.count).toBe(0)
      expect(result.adjusted.valid.count).toBe(0)
    })

    it('classifies an adjusted row under adjusted', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADJUSTED }
      ])

      const result = countByValidity({ wasteRecords, recordChanges })

      expect(result.adjusted.valid.count).toBe(1)
      expect(result.added.valid.count).toBe(0)
      expect(result.unchanged.valid.count).toBe(0)
    })

    it('classifies an unchanged row under unchanged', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.UNCHANGED }
      ])

      const result = countByValidity({ wasteRecords, recordChanges })

      expect(result.unchanged.valid.count).toBe(1)
      expect(result.added.valid.count).toBe(0)
      expect(result.adjusted.valid.count).toBe(0)
    })
  })

  describe('validity based on issues', () => {
    it('classifies as valid when issues array is empty', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED, issues: [] }
      ])

      const result = countByValidity({ wasteRecords, recordChanges })

      expect(result.added.valid.count).toBe(1)
      expect(result.added.invalid.count).toBe(0)
    })

    it('classifies as invalid when issues array has items', () => {
      const { wasteRecords, recordChanges } = build([
        {
          change: RECORD_CHANGE.ADDED,
          issues: [
            {
              severity: 'error',
              category: 'TECHNICAL',
              message: 'Invalid value',
              code: 'INVALID_TYPE',
              context: {}
            }
          ]
        }
      ])

      const result = countByValidity({ wasteRecords, recordChanges })

      expect(result.added.invalid.count).toBe(1)
      expect(result.added.valid.count).toBe(0)
    })
  })

  describe('skips IGNORED rows', () => {
    it('does not count IGNORED rows', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.IGNORED },
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.INCLUDED }
      ])

      const result = countByValidity({ wasteRecords, recordChanges })

      expect(result.added.valid.count).toBe(1)
    })

    it('silently excludes IGNORED rows across added, adjusted, and unchanged categories', () => {
      const { wasteRecords, recordChanges } = build([
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.IGNORED },
        { change: RECORD_CHANGE.ADJUSTED, outcome: ROW_OUTCOME.IGNORED },
        { change: RECORD_CHANGE.UNCHANGED, outcome: ROW_OUTCOME.IGNORED },
        { change: RECORD_CHANGE.ADDED, outcome: ROW_OUTCOME.INCLUDED }
      ])

      const result = countByValidity({ wasteRecords, recordChanges })

      expect(result.added.valid.count).toBe(1)
      expect(result.added.invalid.count).toBe(0)
      expect(result.adjusted.valid.count).toBe(0)
      expect(result.adjusted.invalid.count).toBe(0)
      expect(result.unchanged.valid.count).toBe(0)
      expect(result.unchanged.invalid.count).toBe(0)
    })
  })

  describe('truncation', () => {
    it('truncates rowId arrays at 100 but totals reflect full count', () => {
      const { wasteRecords, recordChanges } = build(
        Array.from({ length: 150 }, () => ({ change: RECORD_CHANGE.ADDED }))
      )

      const result = countByValidity({ wasteRecords, recordChanges })

      expect(result.added.valid.rowIds).toHaveLength(100)
      expect(result.added.valid.count).toBe(150)
    })
  })
})

describe('mergeLoads', () => {
  it('merges validation results and classification results into loads', () => {
    const validationResults = {
      added: {
        valid: { count: 3, rowIds: ['r1', 'r2', 'r3'] },
        invalid: { count: 1, rowIds: ['r4'] }
      },
      unchanged: {
        valid: { count: 0, rowIds: [] },
        invalid: { count: 0, rowIds: [] }
      },
      adjusted: {
        valid: { count: 0, rowIds: [] },
        invalid: { count: 0, rowIds: [] }
      }
    }

    const classificationResults = {
      added: {
        included: { count: 2, rowIds: ['r1', 'r2'] },
        excluded: { count: 1, rowIds: ['r3'] }
      },
      unchanged: {
        included: { count: 0, rowIds: [] },
        excluded: { count: 0, rowIds: [] }
      },
      adjusted: {
        included: { count: 0, rowIds: [] },
        excluded: { count: 0, rowIds: [] }
      }
    }

    const result = mergeLoads(validationResults, classificationResults)

    expect(result).toEqual({
      added: {
        valid: { count: 3, rowIds: ['r1', 'r2', 'r3'] },
        invalid: { count: 1, rowIds: ['r4'] },
        included: { count: 2, rowIds: ['r1', 'r2'] },
        excluded: { count: 1, rowIds: ['r3'] }
      },
      unchanged: {
        valid: { count: 0, rowIds: [] },
        invalid: { count: 0, rowIds: [] },
        included: { count: 0, rowIds: [] },
        excluded: { count: 0, rowIds: [] }
      },
      adjusted: {
        valid: { count: 0, rowIds: [] },
        invalid: { count: 0, rowIds: [] },
        included: { count: 0, rowIds: [] },
        excluded: { count: 0, rowIds: [] }
      }
    })
  })
})
