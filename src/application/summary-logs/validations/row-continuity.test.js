import { validateRowContinuity } from './row-continuity.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
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
      }
    },
    issues: [],
    outcome: ROW_OUTCOME.INCLUDED,
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
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
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

    it('returns valid result when previously submitted rows are present with updated values', () => {
      const result = validateRowContinuity({
        wasteRecords: [createValidatedWasteRecord({ rowId: 'row-1' })],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1')
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

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0]?.category).toBe(VALIDATION_CATEGORY.BUSINESS)
      expect(fatals[0]?.code).toBe('SEQUENTIAL_ROW_REMOVED')
      expect(fatals[0]?.message).toContain('row-1')
      expect(fatals[0]?.message).toContain('cannot be removed')
      expect(fatals[0]?.context?.location?.rowId).toBe('row-1')
      expect(fatals[0]?.context?.location?.sheet).toBe('Received')
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

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(2)
      expect(fatals[0]?.code).toBe('SEQUENTIAL_ROW_REMOVED')
      expect(fatals[1]?.code).toBe('SEQUENTIAL_ROW_REMOVED')

      const missingRowIds = fatals.map((f) => f.context?.location?.rowId).sort()
      expect(missingRowIds).toEqual(['row-1', 'row-3'])
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

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(2)
    })
  })

  describe('edge cases', () => {
    it('returns valid result when upload has no data rows and there is no previous submission', () => {
      const result = validateRowContinuity({
        wasteRecords: [],
        previousSubmission: null
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('returns fatal error when upload has no data rows but a previous submission exists', () => {
      const result = validateRowContinuity({
        wasteRecords: [],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1'),
          createWasteRecordState('row-2')
        ])
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(2)
    })

    it('names the previous summary log and when it was submitted in the error context', () => {
      const result = validateRowContinuity({
        wasteRecords: [],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1')
        ])
      })

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)

      expect(fatals[0]?.context?.previousSummaryLog).toEqual({
        id: PREVIOUS_SUMMARY_LOG_ID,
        submittedAt: PREVIOUS_SUBMITTED_AT.toISOString()
      })
    })
  })

  describe('different waste record types', () => {
    it('validates rows across different waste record types', () => {
      const result = validateRowContinuity({
        wasteRecords: [
          createValidatedWasteRecord({ rowId: 'row-1' }),
          createValidatedWasteRecord({ rowId: 'row-2' })
        ],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1', WASTE_RECORD_TYPE.RECEIVED),
          createWasteRecordState('row-2', WASTE_RECORD_TYPE.RECEIVED),
          createWasteRecordState('row-3', WASTE_RECORD_TYPE.RECEIVED)
        ])
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0]?.context?.location?.rowId).toBe('row-3')
      expect(fatals[0]?.context?.location?.sheet).toBe('Received')
    })

    it('treats the same rowId under a different waste record type as a distinct row', () => {
      const result = validateRowContinuity({
        wasteRecords: [
          createValidatedWasteRecord({
            rowId: 'row-1',
            type: WASTE_RECORD_TYPE.RECEIVED
          })
        ],
        previousSubmission: createPreviousSubmission([
          createWasteRecordState('row-1', WASTE_RECORD_TYPE.PROCESSED)
        ])
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0]?.context?.location?.rowId).toBe('row-1')
      expect(fatals[0]?.context?.location?.sheet).toBe('Processed')
    })

    it('correctly maps different waste record types to sheets and tables from the schema registry', () => {
      const testCases = [
        {
          type: WASTE_RECORD_TYPE.RECEIVED,
          expectedSheet: 'Received',
          expectedTable: 'RECEIVED_LOADS_FOR_REPROCESSING'
        },
        {
          type: WASTE_RECORD_TYPE.PROCESSED,
          expectedSheet: 'Processed',
          expectedTable: 'REPROCESSED_LOADS'
        },
        {
          type: WASTE_RECORD_TYPE.SENT_ON,
          expectedSheet: 'Sent on',
          expectedTable: 'SENT_ON_LOADS'
        },
        {
          type: WASTE_RECORD_TYPE.EXPORTED,
          expectedSheet: 'Exported',
          expectedTable: 'RECEIVED_LOADS_FOR_EXPORT'
        }
      ]

      for (const { type, expectedSheet, expectedTable } of testCases) {
        const result = validateRowContinuity({
          wasteRecords: [],
          previousSubmission: createPreviousSubmission([
            createWasteRecordState('row-1', type)
          ])
        })

        const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
        expect(fatals[0]?.context?.location?.sheet).toBe(expectedSheet)
        expect(fatals[0]?.context?.location?.table).toBe(expectedTable)
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

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0]?.context?.location?.sheet).toBe('Unknown')
      expect(fatals[0]?.context?.location?.table).toBe('Unknown')
    })
  })
})
