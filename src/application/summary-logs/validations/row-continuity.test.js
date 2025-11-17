import { validateRowContinuity } from './row-continuity.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/validation/validation-issues.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

describe('validateRowContinuity', () => {
  const createSummaryLog = (overrides = {}) => ({
    id: 'summary-log-123',
    organisationId: 'org-456',
    registrationId: 'reg-789',
    accreditationId: 'acc-111',
    file: {
      uri: 's3://bucket/file.xlsx'
    },
    ...overrides
  })

  const createParsedData = (rows = []) => ({
    meta: {
      PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' }
    },
    data: {
      RECEIVED_LOADS_FOR_REPROCESSING: {
        location: { sheet: 'Received', row: 1, column: 'A' },
        headers: ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING', 'GROSS_WEIGHT'],
        rows
      }
    }
  })

  const createWasteRecord = (rowId, type = 'received', overrides = {}) => ({
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
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([['row-1', '2024-01-15', 100]])
      const existingWasteRecords = []

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
      expect(result.hasIssues()).toBe(false)
    })

    it('returns valid result when existingWasteRecords is null', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([['row-1', '2024-01-15', 100]])
      const existingWasteRecords = null

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('returns valid result when existingWasteRecords is undefined', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([['row-1', '2024-01-15', 100]])
      const existingWasteRecords = undefined

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('subsequent uploads with all rows present', () => {
    it('returns valid result when all existing rows are present', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([
        ['row-1', '2024-01-15', 100],
        ['row-2', '2024-01-15', 200]
      ])
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
      expect(result.hasIssues()).toBe(false)
    })

    it('returns valid result when existing rows are present with updated values', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([
        ['row-1', '2024-02-15', 150] // Updated date and tonnage
      ])
      const existingWasteRecords = [createWasteRecord('row-1')]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('subsequent uploads with new rows added', () => {
    it('returns valid result when new rows are added alongside existing rows', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([
        ['row-1', '2024-01-15', 100], // Existing
        ['row-2', '2024-01-15', 200], // Existing
        ['row-3', '2024-01-15', 300] // New row added
      ])
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('returns valid result when only new rows are added', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([
        ['row-1', '2024-01-15', 100], // Existing
        ['row-3', '2024-01-15', 300], // New
        ['row-4', '2024-01-15', 400] // New
      ])
      const existingWasteRecords = [createWasteRecord('row-1')]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('subsequent uploads with missing rows', () => {
    it('returns fatal business error when a single row is missing', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([
        ['row-2', '2024-01-15', 200] // row-1 is missing
      ])
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
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
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([
        ['row-2', '2024-01-15', 200] // row-1 and row-3 are missing
      ])
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2'),
        createWasteRecord('row-3')
      ]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
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
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([
        ['row-3', '2024-01-15', 300] // All previous rows removed
      ])
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
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
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([]) // No rows
      const existingWasteRecords = []

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('returns fatal error when upload has no data rows but existing records exist', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([]) // No rows
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(2)
    })

    it('returns fatal error when transformation fails', () => {
      const summaryLog = createSummaryLog()
      // Invalid parsed data that will cause transformation to fail
      const parsed = {
        meta: {
          PROCESSING_TYPE: { value: 'UNKNOWN_TYPE' }
        },
        data: {}
      }
      const existingWasteRecords = [createWasteRecord('row-1')]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      // Should fail validation if transformation fails at this stage
      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].category).toBe(VALIDATION_CATEGORY.TECHNICAL)
      expect(fatals[0].code).toBe('VALIDATION_SYSTEM_ERROR')
      // Message is the error message from the transformation failure
      expect(fatals[0].message).toBeTruthy()
    })

    it('includes previous summary log information in error context', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([])
      const previousSummaryLogId = 'prev-123'
      const previousSubmitTime = '2024-01-10T10:00:00.000Z'

      const existingWasteRecords = [
        createWasteRecord('row-1', 'received', {
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
        parsed,
        summaryLog,
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
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([
        ['row-1', '2024-01-15', 100],
        ['row-2', '2024-01-15', 200]
      ])
      const existingWasteRecords = [
        createWasteRecord('row-1', 'received'),
        createWasteRecord('row-2', 'received'),
        createWasteRecord('row-3', 'received') // Missing from upload
      ]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
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
        { type: 'received', expectedSheet: 'Received' },
        { type: 'processed', expectedSheet: 'Processed' },
        { type: 'sentOn', expectedSheet: 'Sent on' },
        { type: 'exported', expectedSheet: 'Exported' }
      ]

      for (const { type, expectedSheet } of testCases) {
        const summaryLog = createSummaryLog()
        const parsed = createParsedData([])
        const existingWasteRecords = [createWasteRecord('row-1', type)]

        const result = validateRowContinuity({
          parsed,
          summaryLog,
          existingWasteRecords
        })

        const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
        expect(fatals[0].context.location.sheet).toBe(expectedSheet)
      }
    })
  })

  describe('idempotent uploads (same file uploaded twice)', () => {
    it('returns valid result when exact same data is uploaded again', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([
        ['row-1', '2024-01-15', 100],
        ['row-2', '2024-01-15', 200]
      ])
      const existingWasteRecords = [
        createWasteRecord('row-1'),
        createWasteRecord('row-2')
      ]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
        existingWasteRecords
      })

      // Should pass - idempotent upload contains all existing rows
      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('unknown waste record types', () => {
    it('handles unknown waste record type with fallback sheet and table names', () => {
      const summaryLog = createSummaryLog()
      const parsed = createParsedData([])
      const existingWasteRecords = [createWasteRecord('row-1', 'unknownType')]

      const result = validateRowContinuity({
        parsed,
        summaryLog,
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
