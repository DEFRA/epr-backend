import { describe, expect, it } from 'vitest'
import { classifyByPeriodStatus } from './period-status.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

/**
 * @param {object} overrides
 * @returns {import('#application/waste-records/transform-from-summary-log.js').ValidatedWasteRecord}
 */
const buildWasteRecord = ({
  rowId = '1000',
  date = '2026-01-15',
  dateField = 'DATE_RECEIVED_FOR_REPROCESSING',
  outcome = ROW_OUTCOME.INCLUDED,
  change = 'CREATED',
  summaryLogId = 'sl-1',
  tableName = 'RECEIVED_LOADS_FOR_REPROCESSING',
  wasteRecordType = 'received'
} = {}) => ({
  record: {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    rowId,
    type: wasteRecordType,
    data: { [dateField]: date },
    versions: [
      {
        summaryLog: { id: summaryLogId },
        status:
          change === 'CREATED' ? VERSION_STATUS.CREATED : VERSION_STATUS.UPDATED
      }
    ]
  },
  issues: [],
  outcome,
  change,
  tableName,
  wasteRecordType
})

const SUMMARY_LOG_ID = 'sl-1'

const TABLE_SCHEMAS = {
  RECEIVED_LOADS_FOR_REPROCESSING: {
    reportingDateField: 'DATE_RECEIVED_FOR_REPROCESSING',
    wasteRecordType: 'received'
  }
}

const emptyBucket = () => ({
  included: { count: 0, tonnes: 0 },
  excluded: { count: 0 }
})

const emptyStatus = () => ({
  added: emptyBucket(),
  adjusted: emptyBucket()
})

const emptyResult = () => ({
  open: emptyStatus(),
  closed: emptyStatus()
})

describe('classifyByPeriodStatus', () => {
  describe('period classification', () => {
    it('classifies a load in an open period as open/added/included', () => {
      const wasteRecords = [
        buildWasteRecord({ date: '2026-01-15', tonnage: 10 })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map([['1000', 10]])
      })

      expect(result.open.added.included).toEqual({ count: 1, tonnes: 10 })
    })

    it('classifies a load in a closed period as closed/added/included', () => {
      const wasteRecords = [
        buildWasteRecord({ date: '2026-01-15', tonnage: 10 })
      ]

      // Period 1 (Jan) for monthly cadence has a previous submission => closed
      const submittedReports = [
        {
          year: 2026,
          reports: {
            monthly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                dueDate: '2026-02-20',
                current: null,
                previousSubmissions: [{ id: 'report-1' }]
              }
            }
          }
        }
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports,
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map([['1000', 10]])
      })

      expect(result.closed.added.included).toEqual({ count: 1, tonnes: 10 })
      expect(result.open.added.included).toEqual({ count: 0, tonnes: 0 })
    })

    it('treats a period as closed when current report is submitted (no previousSubmissions)', () => {
      const wasteRecords = [
        buildWasteRecord({ date: '2026-01-15', tonnage: 10 })
      ]

      const submittedReports = [
        {
          year: 2026,
          reports: {
            monthly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                dueDate: '2026-02-20',
                current: { id: 'report-1', status: 'submitted' },
                previousSubmissions: []
              }
            }
          }
        }
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports,
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map([['1000', 10]])
      })

      expect(result.closed.added.included).toEqual({ count: 1, tonnes: 10 })
      expect(result.open.added.included).toEqual({ count: 0, tonnes: 0 })
    })

    it('classifies quarterly periods for registered-only registrations', () => {
      const tableSchemas = {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          reportingDateField: 'MONTH_RECEIVED_FOR_REPROCESSING',
          wasteRecordType: 'received'
        }
      }

      const wasteRecords = [
        buildWasteRecord({
          date: '2026-02',
          dateField: 'MONTH_RECEIVED_FOR_REPROCESSING',
          tableName: 'RECEIVED_LOADS_FOR_REPROCESSING'
        })
      ]

      // Q1 (period 1) is closed
      const submittedReports = [
        {
          year: 2026,
          reports: {
            quarterly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-03-31',
                dueDate: '2026-04-20',
                current: null,
                previousSubmissions: [{ id: 'report-q1' }]
              }
            }
          }
        }
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: {},
        submittedReports,
        tableSchemas,
        transactionAmounts: new Map()
      })

      expect(result.closed.added.excluded).toEqual({ count: 1 })
    })
  })

  describe('record status classification', () => {
    it('classifies adjusted records into adjusted bucket', () => {
      const wasteRecords = [buildWasteRecord({ change: 'UPDATED' })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map([['1000', 5]])
      })

      expect(result.open.adjusted.included).toEqual({ count: 1, tonnes: 5 })
    })
  })

  describe('inclusion classification', () => {
    it('classifies excluded records without tonnes', () => {
      const wasteRecords = [buildWasteRecord({ outcome: ROW_OUTCOME.EXCLUDED })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      expect(result.open.added.excluded).toEqual({ count: 1 })
      expect(result.open.added.included).toEqual({ count: 0, tonnes: 0 })
    })
  })

  describe('skipped records', () => {
    it('skips unchanged records', () => {
      const wasteRecords = [
        buildWasteRecord({
          change: 'UNCHANGED',
          summaryLogId: 'other-sl'
        })
      ]
      // The record's last version doesn't match summaryLogId => unchanged
      wasteRecords[0].record.versions = [
        { summaryLog: { id: 'other-sl' }, status: VERSION_STATUS.CREATED }
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      expect(result).toEqual(emptyResult())
    })

    it('skips IGNORED records', () => {
      const wasteRecords = [buildWasteRecord({ outcome: ROW_OUTCOME.IGNORED })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      expect(result).toEqual(emptyResult())
    })
  })

  describe('edge cases', () => {
    it('returns empty result when no waste records', () => {
      const result = classifyByPeriodStatus({
        wasteRecords: [],
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      expect(result).toEqual(emptyResult())
    })

    it('all loads in open periods when no submitted reports', () => {
      const wasteRecords = [
        buildWasteRecord({ rowId: '1000', date: '2026-01-15' }),
        buildWasteRecord({ rowId: '1001', date: '2026-03-15' })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['1000', 10],
          ['1001', 20]
        ])
      })

      expect(result.open.added.included).toEqual({ count: 2, tonnes: 30 })
      expect(result.closed).toEqual(emptyStatus())
    })

    it('accumulates tonnage across multiple included records', () => {
      const wasteRecords = [
        buildWasteRecord({ rowId: '1000', date: '2026-01-15' }),
        buildWasteRecord({ rowId: '1001', date: '2026-01-20' })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['1000', 7.5],
          ['1001', 2.5]
        ])
      })

      expect(result.open.added.included).toEqual({ count: 2, tonnes: 10 })
    })

    it('skips records with no date value', () => {
      const wasteRecords = [buildWasteRecord({ date: null })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      expect(result).toEqual(emptyResult())
    })

    it('ignores submitted reports for a different cadence', () => {
      const wasteRecords = [buildWasteRecord({ date: '2026-01-15' })]

      const submittedReports = [
        {
          year: 2026,
          reports: {
            quarterly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-03-31',
                dueDate: '2026-04-20',
                current: { id: 'r-1', status: 'submitted' },
                previousSubmissions: []
              }
            }
          }
        }
      ]

      // Registration is accredited => monthly cadence, but reports are quarterly
      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports,
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      // All open because monthly slots don't exist in the reports
      expect(result.open.added.excluded.count).toBe(1)
      expect(result.closed.added.excluded.count).toBe(0)
    })

    it('treats open periods with in_progress reports as open', () => {
      const wasteRecords = [buildWasteRecord({ date: '2026-01-15' })]

      const submittedReports = [
        {
          year: 2026,
          reports: {
            monthly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                dueDate: '2026-02-20',
                current: { id: 'r-1', status: 'in_progress' },
                previousSubmissions: []
              }
            }
          }
        }
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports,
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      expect(result.open.added.excluded.count).toBe(1)
      expect(result.closed.added.excluded.count).toBe(0)
    })

    it('defaults to zero tonnes when transactionAmounts has no entry for rowId', () => {
      const wasteRecords = [buildWasteRecord()]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      expect(result.open.added.included).toEqual({ count: 1, tonnes: 0 })
    })

    it('handles Date objects as date values', () => {
      const wasteRecords = [buildWasteRecord({ date: new Date('2026-01-15') })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      expect(result.open.added.excluded.count).toBe(1)
    })

    it('handles records with no matching table schema gracefully', () => {
      const wasteRecords = [buildWasteRecord({ tableName: 'UNKNOWN_TABLE' })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        wasteBalanceRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: { accreditation: { status: 'approved' } },
        submittedReports: [],
        tableSchemas: TABLE_SCHEMAS,
        transactionAmounts: new Map()
      })

      // Record is skipped when table schema not found
      expect(result).toEqual(emptyResult())
    })
  })
})
