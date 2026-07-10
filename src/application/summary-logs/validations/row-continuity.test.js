import { validateRowContinuity } from './row-continuity.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import {
  WASTE_RECORD_CHANGE,
  WASTE_RECORD_TYPE
} from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {WasteRecordType} from '#domain/waste-records/model.js' */
/** @import {PreviousSubmission, WasteRecordState} from '#waste-records/application/read-summary-log-row-states.js' */

const PREVIOUS_SUMMARY_LOG_ID = 'previous-summary-log-id'
const PREVIOUS_SUBMITTED_AT = new Date('2024-01-15T10:00:00.000Z')

describe('validateRowContinuity', () => {
  /**
   * A transformed record from the upload under validation
   *
   * @param {{ rowId: string, type?: WasteRecordType }} options
   * @returns {ValidatedWasteRecord}
   */
  const createValidatedWasteRecord = ({
    rowId,
    type = WASTE_RECORD_TYPE.RECEIVED
  }) => ({
    record: {
      organisationId: 'org-456',
      registrationId: 'reg-789',
      accreditationId: 'acc-111',
      rowId,
      type,
      data: {
        ROW_ID: rowId,
        DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15',
        GROSS_WEIGHT: 100
      },
      versions: []
    },
    issues: [],
    outcome: ROW_OUTCOME.INCLUDED,
    change: WASTE_RECORD_CHANGE.CREATED,
    tableName: 'RECEIVED_LOADS_FOR_REPROCESSING',
    wasteRecordType: type
  })

  /**
   * A row state belonging to the latest submitted summary log
   *
   * @param {string} rowId
   * @param {WasteRecordType} [wasteRecordType]
   * @returns {WasteRecordState}
   */
  const createWasteRecordState = (
    rowId,
    wasteRecordType = WASTE_RECORD_TYPE.RECEIVED
  ) => ({
    rowId,
    wasteRecordType,
    data: {
      DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15',
      GROSS_WEIGHT: 100
    },
    classification: {
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 100
    }
  })

  /**
   * @param {WasteRecordState[]} wasteRecordStates
   * @returns {PreviousSubmission}
   */
  const createPreviousSubmission = (wasteRecordStates) => ({
    summaryLog: {
      summaryLogId: PREVIOUS_SUMMARY_LOG_ID,
      submittedAt: PREVIOUS_SUBMITTED_AT
    },
    wasteRecordStates
  })

  /**
   * The nth fatal issue, with the context and location the row-removal FATAL
   * always carries — so assertions read them without optional-chaining past a
   * missing issue and silently passing.
   *
   * @param {ValidationIssuesCollector} result
   * @param {number} [index]
   */
  const requireFatal = (result, index = 0) => {
    const fatal = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)[index]

    if (fatal === undefined) {
      throw new Error(`Expected a fatal issue at index ${index}`)
    }

    const { context } = fatal
    const location = context?.location

    if (context === undefined || location === undefined) {
      throw new Error(`Fatal issue ${fatal.code} carries no location`)
    }

    return { ...fatal, context, location }
  }

  const fatalCount = (result) =>
    result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL).length

  describe('first-time uploads (no previously submitted summary log)', () => {
    it('returns valid result when the registration has never submitted', () => {
      const result = validateRowContinuity({
        wasteRecords: [createValidatedWasteRecord({ rowId: 'row-1' })],
        previousSubmission: null
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
      expect(result.hasIssues()).toBe(false)
    })

    it('returns valid result when the previous submission has no rows', () => {
      const result = validateRowContinuity({
        wasteRecords: [createValidatedWasteRecord({ rowId: 'row-1' })],
        previousSubmission: createPreviousSubmission([])
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('subsequent uploads with all rows present', () => {
    it('returns valid result when all previously submitted rows are present', () => {
      const result = validateRowContinuity({
        wasteRecords: [
          createValidatedWasteRecord({ rowId: 'row-1' }),
          createValidatedWasteRecord({ rowId: 'row-2' })
        ],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1'),
          createWasteRecordState('row-2')
        ])
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
      expect(result.hasIssues()).toBe(false)
    })

    it('returns valid result when a previously submitted row is present with updated values', () => {
      const result = validateRowContinuity({
        wasteRecords: [createValidatedWasteRecord({ rowId: 'row-1' })],
        previousSubmission: createPreviousSubmission([
          { ...createWasteRecordState('row-1'), data: { GROSS_WEIGHT: 250 } }
        ])
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('subsequent uploads with new rows added', () => {
    it('returns valid result when new rows are added alongside previously submitted rows', () => {
      const result = validateRowContinuity({
        wasteRecords: [
          createValidatedWasteRecord({ rowId: 'row-1' }),
          createValidatedWasteRecord({ rowId: 'row-2' }),
          createValidatedWasteRecord({ rowId: 'row-3' })
        ],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1'),
          createWasteRecordState('row-2')
        ])
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('returns valid result when only new rows are added', () => {
      const result = validateRowContinuity({
        wasteRecords: [
          createValidatedWasteRecord({ rowId: 'row-1' }),
          createValidatedWasteRecord({ rowId: 'row-3' }),
          createValidatedWasteRecord({ rowId: 'row-4' })
        ],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1')
        ])
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('subsequent uploads with missing rows', () => {
    it('returns fatal business error when a single row is missing', () => {
      const result = validateRowContinuity({
        wasteRecords: [createValidatedWasteRecord({ rowId: 'row-2' })],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1'),
          createWasteRecordState('row-2')
        ])
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)
      expect(fatalCount(result)).toBe(1)

      const fatal = requireFatal(result)
      expect(fatal.category).toBe(VALIDATION_CATEGORY.BUSINESS)
      expect(fatal.code).toBe('SEQUENTIAL_ROW_REMOVED')
      expect(fatal.message).toContain('row-1')
      expect(fatal.message).toContain('cannot be removed')
      expect(fatal.location.rowId).toBe('row-1')
      expect(fatal.location.sheet).toBe('Received')
    })

    it('returns fatal errors for multiple missing rows', () => {
      const result = validateRowContinuity({
        wasteRecords: [createValidatedWasteRecord({ rowId: 'row-2' })],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1'),
          createWasteRecordState('row-2'),
          createWasteRecordState('row-3')
        ])
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)
      expect(fatalCount(result)).toBe(2)

      const fatals = [requireFatal(result, 0), requireFatal(result, 1)]
      expect(fatals.map((fatal) => fatal.code)).toEqual([
        'SEQUENTIAL_ROW_REMOVED',
        'SEQUENTIAL_ROW_REMOVED'
      ])
      expect(fatals.map((fatal) => fatal.location.rowId).sort()).toEqual([
        'row-1',
        'row-3'
      ])
    })

    it('returns fatal error when all previously submitted rows are removed', () => {
      const result = validateRowContinuity({
        wasteRecords: [createValidatedWasteRecord({ rowId: 'row-3' })],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1'),
          createWasteRecordState('row-2')
        ])
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)
      expect(fatalCount(result)).toBe(2)
    })

    it('names the latest submitted summary log the removed row belonged to', () => {
      const result = validateRowContinuity({
        wasteRecords: [],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1')
        ])
      })

      expect(fatalCount(result)).toBe(1)
      expect(requireFatal(result).context.previousSummaryLog).toEqual({
        id: PREVIOUS_SUMMARY_LOG_ID,
        submittedAt: '2024-01-15T10:00:00.000Z'
      })
    })
  })

  describe('edge cases', () => {
    it('returns fatal error when upload has no data rows but a previous submission has rows', () => {
      const result = validateRowContinuity({
        wasteRecords: [],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1'),
          createWasteRecordState('row-2')
        ])
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)
      expect(fatalCount(result)).toBe(2)
    })
  })

  describe('different waste record types', () => {
    it('matches rows on waste record type as well as row id', () => {
      const result = validateRowContinuity({
        wasteRecords: [
          createValidatedWasteRecord({
            rowId: 'row-1',
            type: WASTE_RECORD_TYPE.RECEIVED
          })
        ],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1', WASTE_RECORD_TYPE.RECEIVED),
          createWasteRecordState('row-1', WASTE_RECORD_TYPE.PROCESSED)
        ])
      })

      expect(result.isFatal()).toBe(true)
      expect(fatalCount(result)).toBe(1)
      expect(requireFatal(result).location.sheet).toBe('Processed')
    })

    it('correctly maps different waste record types to sheets and tables from schema registry', () => {
      const testCases = [
        {
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          expectedSheet: 'Received',
          expectedTable: 'RECEIVED_LOADS_FOR_REPROCESSING'
        },
        {
          wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
          expectedSheet: 'Processed',
          expectedTable: 'REPROCESSED_LOADS'
        },
        {
          wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
          expectedSheet: 'Sent on',
          expectedTable: 'SENT_ON_LOADS'
        },
        {
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          expectedSheet: 'Exported',
          expectedTable: 'RECEIVED_LOADS_FOR_EXPORT'
        }
      ]

      for (const {
        wasteRecordType,
        expectedSheet,
        expectedTable
      } of testCases) {
        const result = validateRowContinuity({
          wasteRecords: [],
          previousSubmission: createPreviousSubmission([
            createWasteRecordState('row-1', wasteRecordType)
          ])
        })

        const fatal = requireFatal(result)
        expect(fatal.location.sheet).toBe(expectedSheet)
        expect(fatal.location.table).toBe(expectedTable)
      }
    })
  })

  describe('idempotent uploads (same file uploaded twice)', () => {
    it('returns valid result when exact same data is uploaded again', () => {
      const result = validateRowContinuity({
        wasteRecords: [
          createValidatedWasteRecord({ rowId: 'row-1' }),
          createValidatedWasteRecord({ rowId: 'row-2' })
        ],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1'),
          createWasteRecordState('row-2')
        ])
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('unknown waste record types', () => {
    it('handles unknown waste record type with fallback sheet and table names', () => {
      const result = validateRowContinuity({
        wasteRecords: [],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState(
            'row-1',
            /** @type {WasteRecordType} */ ('unknownType')
          )
        ])
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)
      expect(fatalCount(result)).toBe(1)

      const fatal = requireFatal(result)
      expect(fatal.location.sheet).toBe('Unknown')
      expect(fatal.location.table).toBe('Unknown')
    })
  })
})
