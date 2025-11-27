import { validateRowContinuity } from './row-continuity.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import {
  VERSION_STATUS,
  WASTE_RECORD_TYPE
} from '#domain/waste-records/model.js'

describe('validateRowContinuity', () => {
  /**
   * Creates a transformed record for testing
   * @param {Object} options
   * @param {string} options.rowId - The row ID
   * @param {string} [options.type] - The waste record type
   * @param {Array} [options.issues] - Validation issues
   * @returns {{ record: Object, issues: Array }}
   */
  const createValidatedWasteRecord = ({
    rowId,
    type = WASTE_RECORD_TYPE.RECEIVED,
    issues = []
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
      versions: [
        {
          createdAt: new Date().toISOString(),
          status: VERSION_STATUS.CREATED,
          summaryLog: {
            id: 'current-summary-log-id',
            uri: 's3://bucket/current-file.xlsx'
          },
          data: {
            ROW_ID: rowId,
            DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15',
            GROSS_WEIGHT: 100
          }
        }
      ]
    },
    issues
  })

  /**
   * Creates an existing waste record for testing
   * @param {string} rowId - The row ID
   * @param {string} [type] - The waste record type
   * @param {Object} [overrides] - Property overrides
   * @returns {Object} Waste record
   */
  const createWasteRecord = (
    rowId,
    type = WASTE_RECORD_TYPE.RECEIVED,
    overrides = {}
  ) => ({
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
    versions: [
      {
        createdAt: '2024-01-15T10:00:00.000Z',
        status: VERSION_STATUS.CREATED,
        summaryLog: {
          id: 'previous-summary-log-id',
          uri: 's3://bucket/previous-file.xlsx'
        },
        data: {
          ROW_ID: rowId,
          DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15',
          GROSS_WEIGHT: 100
        }
      }
    ],
    ...overrides
  })

  describe('first-time uploads (no existing records)', () => {
    it('returns valid result when no existing records exist', () => {
      const wasteRecords = [createValidatedWasteRecord({ rowId: 'row-1' })]
      const existingWasteRecords = []

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
      expect(result.hasIssues()).toBe(false)
    })

    it('returns valid result when existingWasteRecords is null', () => {
      const wasteRecords = [createValidatedWasteRecord({ rowId: 'row-1' })]
      const existingWasteRecords = null

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('returns valid result when existingWasteRecords is undefined', () => {
      const wasteRecords = [createValidatedWasteRecord({ rowId: 'row-1' })]
      const existingWasteRecords = undefined

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('subsequent uploads with all rows present', () => {
    it('returns valid result when all existing rows are present', () => {
      const wasteRecords = [
        createValidatedWasteRecord({ rowId: 'row-1' }),
        createValidatedWasteRecord({ rowId: 'row-2' })
      ]
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
      expect(result.hasIssues()).toBe(false)
    })

    it('returns valid result when existing rows are present with updated values', () => {
      const wasteRecords = [
        createValidatedWasteRecord({ rowId: 'row-1' }) // Updated date and tonnage
      ]
      const existingWasteRecords = [createWasteRecord('row-1')]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('subsequent uploads with new rows added', () => {
    it('returns valid result when new rows are added alongside existing rows', () => {
      const wasteRecords = [
        createValidatedWasteRecord({ rowId: 'row-1' }), // Existing
        createValidatedWasteRecord({ rowId: 'row-2' }), // Existing
        createValidatedWasteRecord({ rowId: 'row-3' }) // New row added
      ]
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('returns valid result when only new rows are added', () => {
      const wasteRecords = [
        createValidatedWasteRecord({ rowId: 'row-1' }), // Existing
        createValidatedWasteRecord({ rowId: 'row-3' }), // New
        createValidatedWasteRecord({ rowId: 'row-4' }) // New
      ]
      const existingWasteRecords = [createWasteRecord('row-1')]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('subsequent uploads with missing rows', () => {
    it('returns fatal business error when a single row is missing', () => {
      const wasteRecords = [
        createValidatedWasteRecord({ rowId: 'row-2' }) // row-1 is missing
      ]
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
      expect(fatals[0].code).toBe('SEQUENTIAL_ROW_REMOVED')
      expect(fatals[0].message).toContain('row-1')
      expect(fatals[0].message).toContain('cannot be removed')
      expect(fatals[0].context.location.rowId).toBe('row-1')
      expect(fatals[0].context.location.sheet).toBe('Received')
      expect(fatals[0].context.previousSummaryLog.id).toBe(
        'previous-summary-log-id'
      )
    })

    it('returns fatal errors for multiple missing rows', () => {
      const wasteRecords = [
        createValidatedWasteRecord({ rowId: 'row-2' }) // row-1 and row-3 are missing
      ]
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2'),
        createWasteRecord('row-3')
      ]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(2)
      expect(fatals[0].code).toBe('SEQUENTIAL_ROW_REMOVED')
      expect(fatals[1].code).toBe('SEQUENTIAL_ROW_REMOVED')

      const missingRowIds = fatals.map((f) => f.context.location.rowId).sort()
      expect(missingRowIds).toEqual(['row-1', 'row-3'])
    })

    it('returns fatal error when all existing rows are removed', () => {
      const wasteRecords = [
        createValidatedWasteRecord({ rowId: 'row-3' }) // All previous rows removed
      ]
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(2)
    })
  })

  describe('edge cases', () => {
    it('returns valid result when upload has no data rows but no existing records either', () => {
      const wasteRecords = []
      const existingWasteRecords = []

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('returns fatal error when upload has no data rows but existing records exist', () => {
      const wasteRecords = []
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(2)
    })

    it('includes previous summary log information in error context', () => {
      const wasteRecords = []
      const previousSummaryLogId = 'prev-123'
      const previousSubmitTime = '2024-01-10T10:00:00.000Z'

      const existingWasteRecords = [
        createWasteRecord('row-1', WASTE_RECORD_TYPE.RECEIVED, {
          versions: [
            {
              createdAt: previousSubmitTime,
              status: VERSION_STATUS.CREATED,
              summaryLog: {
                id: previousSummaryLogId,
                uri: 's3://bucket/prev.xlsx'
              },
              data: { ROW_ID: 'row-1' }
            }
          ]
        })
      ]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].context.previousSummaryLog.id).toBe(previousSummaryLogId)
      expect(fatals[0].context.previousSummaryLog.submittedAt).toBe(
        previousSubmitTime
      )
    })
  })

  describe('different waste record types', () => {
    it('validates rows across different waste record types', () => {
      const wasteRecords = [
        createValidatedWasteRecord({ rowId: 'row-1' }),
        createValidatedWasteRecord({ rowId: 'row-2' })
      ]
      const existingWasteRecords = [
        createWasteRecord('row-1', WASTE_RECORD_TYPE.RECEIVED),
        createWasteRecord('row-2', WASTE_RECORD_TYPE.RECEIVED),
        createWasteRecord('row-3', WASTE_RECORD_TYPE.RECEIVED) // Missing from upload
      ]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].context.location.rowId).toBe('row-3')
      expect(fatals[0].context.location.sheet).toBe('Received')
    })

    it('correctly maps different waste record types to sheets', () => {
      const testCases = [
        { type: WASTE_RECORD_TYPE.RECEIVED, expectedSheet: 'Received' },
        { type: WASTE_RECORD_TYPE.PROCESSED, expectedSheet: 'Processed' },
        { type: WASTE_RECORD_TYPE.SENT_ON, expectedSheet: 'Sent on' },
        { type: WASTE_RECORD_TYPE.EXPORTED, expectedSheet: 'Exported' }
      ]

      for (const { type, expectedSheet } of testCases) {
        const wasteRecords = []
        const existingWasteRecords = [createWasteRecord('row-1', type)]

        const result = validateRowContinuity({
          wasteRecords,
          existingWasteRecords
        })

        const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
        expect(fatals[0].context.location.sheet).toBe(expectedSheet)
      }
    })
  })

  describe('idempotent uploads (same file uploaded twice)', () => {
    it('returns valid result when exact same data is uploaded again', () => {
      const wasteRecords = [
        createValidatedWasteRecord({ rowId: 'row-1' }),
        createValidatedWasteRecord({ rowId: 'row-2' })
      ]
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      // Should pass - idempotent upload contains all existing rows
      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('unknown waste record types', () => {
    it('handles unknown waste record type with fallback sheet and table names', () => {
      const wasteRecords = []
      const existingWasteRecords = [createWasteRecord('row-1', 'unknownType')]

      const result = validateRowContinuity({
        wasteRecords,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].context.location.sheet).toBe('Unknown')
      expect(fatals[0].context.location.table).toBe('UNKNOWN_TABLE')
    })
  })
})
