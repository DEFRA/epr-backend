import { describe, expect, it, vi } from 'vitest'
import {
  buildTransactionAmounts,
  classifyByPeriodStatus
} from './period-status.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */

const accreditedRegistration = /** @type {Registration} */ (
  /** @type {unknown} */ ({ accreditation: { status: 'approved' } })
)

const registeredOnlyRegistration = /** @type {Registration} */ (
  /** @type {unknown} */ ({})
)

const SUMMARY_LOG_ID = 'sl-1'

/**
 * Single-date-field table (most tables).
 */
const SINGLE_DATE_TABLE_SCHEMAS = {
  RECEIVED_LOADS_FOR_REPROCESSING: {
    reportingDateFields: ['DATE_RECEIVED_FOR_REPROCESSING'],
    wasteRecordType: 'received'
  }
}

/**
 * Multi-date-field table (exporter received-loads).
 * DATE_RECEIVED_FOR_EXPORT maps to wasteReceived section,
 * DATE_OF_EXPORT maps to wasteExported section.
 */
const MULTI_DATE_TABLE_SCHEMAS = {
  RECEIVED_LOADS_FOR_EXPORT: {
    reportingDateFields: ['DATE_RECEIVED_FOR_EXPORT', 'DATE_OF_EXPORT'],
    wasteRecordType: 'received'
  }
}

/**
 * @param {object} [overrides]
 * @returns {ValidatedWasteRecord}
 */
const buildWasteRecord = ({
  rowId = '1000',
  data = { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15' },
  outcome = ROW_OUTCOME.INCLUDED,
  change = 'CREATED',
  summaryLogId = SUMMARY_LOG_ID,
  tableName = 'RECEIVED_LOADS_FOR_REPROCESSING',
  wasteRecordType = 'received'
} = {}) =>
  /** @type {ValidatedWasteRecord} */ (
    /** @type {unknown} */ ({
      record: {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId,
        type: wasteRecordType,
        data,
        versions: [
          {
            summaryLog: { id: summaryLogId, uri: 's3://bucket/key' },
            status:
              change === 'CREATED'
                ? VERSION_STATUS.CREATED
                : VERSION_STATUS.UPDATED
          }
        ]
      },
      issues: [],
      outcome,
      change,
      tableName,
      wasteRecordType
    })
  )

const emptyChange = () => ({
  included: { count: 0, tonnageDelta: 0 },
  excluded: { count: 0, tonnageDelta: 0 }
})

const emptyPeriod = () => ({
  added: emptyChange(),
  adjusted: emptyChange()
})

const emptyResult = () => ({
  open: emptyPeriod(),
  closed: emptyPeriod()
})

/**
 * Builds a PeriodicReport with a single submitted period.
 *
 * @param {{ cadence?: string, period?: number, year?: number }} [opts]
 * @returns {PeriodicReport}
 */
const buildSubmittedReport = ({
  cadence = 'monthly',
  period = 1,
  year = 2026
} = {}) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  year,
  reports: {
    [cadence]: {
      [period]: {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        dueDate: '2026-02-20',
        current: null,
        previousSubmissions: [
          {
            id: 'report-1',
            status: 'submitted',
            submissionNumber: 1,
            submittedAt: null,
            submittedBy: null
          }
        ]
      }
    }
  }
})

describe('classifyByPeriodStatus', () => {
  describe('closed-wins rule (multiple reporting date fields)', () => {
    it('classifies a row as closed when one date is in a closed period and another is open', () => {
      // Exporter received-loads row: DATE_RECEIVED_FOR_EXPORT is January (closed),
      // DATE_OF_EXPORT is February (open). Closed-wins => classified as closed.
      const wasteRecords = [
        buildWasteRecord({
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2026-01-15',
            DATE_OF_EXPORT: '2026-02-10'
          },
          tableName: 'RECEIVED_LOADS_FOR_EXPORT'
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'monthly', period: 1 })
        ],
        tableSchemas: MULTI_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 10 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.closed?.added?.included.tonnageDelta).toBe(10)
      expect(result.open).toEqual(emptyPeriod())
    })

    it('classifies a row as open when all dates are in open periods', () => {
      const wasteRecords = [
        buildWasteRecord({
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2026-02-15',
            DATE_OF_EXPORT: '2026-03-10'
          },
          tableName: 'RECEIVED_LOADS_FOR_EXPORT'
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'monthly', period: 1 })
        ],
        tableSchemas: MULTI_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 10 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.open?.added?.included.tonnageDelta).toBe(10)
      expect(result.closed).toEqual(emptyPeriod())
    })

    it('classifies a row as closed when both dates are in closed periods', () => {
      const wasteRecords = [
        buildWasteRecord({
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2026-01-15',
            DATE_OF_EXPORT: '2026-01-20'
          },
          tableName: 'RECEIVED_LOADS_FOR_EXPORT'
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'monthly', period: 1 })
        ],
        tableSchemas: MULTI_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 10 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.closed?.added?.included.tonnageDelta).toBe(10)
    })

    it('skips missing date values but still classifies on present ones', () => {
      // DATE_OF_EXPORT is null, DATE_RECEIVED_FOR_EXPORT is in a closed period => closed
      const wasteRecords = [
        buildWasteRecord({
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2026-01-15',
            DATE_OF_EXPORT: null
          },
          tableName: 'RECEIVED_LOADS_FOR_EXPORT'
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'monthly', period: 1 })
        ],
        tableSchemas: MULTI_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 5 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.closed?.added?.included.tonnageDelta).toBe(5)
    })

    it('skips a record when all date fields are missing', () => {
      const wasteRecords = [
        buildWasteRecord({
          data: {
            DATE_RECEIVED_FOR_EXPORT: null,
            DATE_OF_EXPORT: null
          },
          tableName: 'RECEIVED_LOADS_FOR_EXPORT'
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: MULTI_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result).toEqual(emptyResult())
    })
  })

  describe('single reporting date field', () => {
    it('classifies a load in an open period as open/added/included', () => {
      const wasteRecords = [buildWasteRecord()]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 10 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.open?.added).toEqual({
        included: { count: 1, tonnageDelta: 10 },
        excluded: { count: 0, tonnageDelta: 0 }
      })
    })

    it('classifies a load in a closed period as closed/added/included', () => {
      const wasteRecords = [buildWasteRecord()]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'monthly', period: 1 })
        ],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 10 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.closed?.added?.included.tonnageDelta).toBe(10)
      expect(result.open).toEqual(emptyPeriod())
    })

    it('treats a period as closed when current report is submitted', () => {
      const wasteRecords = [buildWasteRecord()]

      /** @type {PeriodicReport[]} */
      const submittedReports = [
        {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2026,
          reports: {
            monthly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                dueDate: '2026-02-20',
                current: {
                  id: 'report-1',
                  status: 'submitted',
                  submissionNumber: 1,
                  submittedAt: null,
                  submittedBy: null
                },
                previousSubmissions: []
              }
            }
          }
        }
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports,
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 10 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.closed?.added?.included.tonnageDelta).toBe(10)
    })
  })

  describe('quarterly cadence (registered-only)', () => {
    it('classifies using quarterly periods', () => {
      const tableSchemas = {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          reportingDateFields: ['MONTH_RECEIVED_FOR_REPROCESSING'],
          wasteRecordType: 'received'
        }
      }

      // February maps to Q1 (period 1)
      const wasteRecords = [
        buildWasteRecord({
          data: { MONTH_RECEIVED_FOR_REPROCESSING: '2026-02' }
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: registeredOnlyRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'quarterly', period: 1 })
        ],
        tableSchemas,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 8 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.closed?.added?.included.tonnageDelta).toBe(8)
      expect(result.open).toEqual(emptyPeriod())
    })
  })

  describe('record status (added vs adjusted)', () => {
    it('classifies adjusted records into adjusted bucket', () => {
      const wasteRecords = [buildWasteRecord({ change: 'UPDATED' })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 5 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.open?.adjusted?.included.tonnageDelta).toBe(5)
    })
  })

  describe('tonnageDelta', () => {
    it('zero tonnageDelta for excluded records with no prior contribution', () => {
      const wasteRecords = [buildWasteRecord({ outcome: ROW_OUTCOME.EXCLUDED })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result.open?.added).toEqual({
        included: { count: 0, tonnageDelta: 0 },
        excluded: { count: 1, tonnageDelta: 0 }
      })
    })

    it('negative tonnageDelta when an adjusted record becomes excluded', () => {
      // Record was previously included at 10 tonnes, now excluded.
      // The reversal (-10) must appear in adjusted.tonnageDelta
      // so the frontend can show "these adjusted loads will remove 10 tonnes".
      const oldRecord = /** @type {WasteRecord} */ (
        /** @type {unknown} */ ({
          type: 'received',
          rowId: '1000',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15' }
        })
      )

      const wasteRecords = [
        buildWasteRecord({
          change: 'UPDATED',
          outcome: ROW_OUTCOME.EXCLUDED
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 10, newAmount: 0 }]
        ]),
        existingRecordsMap: new Map([['received:1000', oldRecord]])
      })

      expect(result.open?.adjusted?.excluded).toEqual({
        count: 1,
        tonnageDelta: -10
      })
      expect(result.open?.adjusted?.included.tonnageDelta).toBe(0)
    })
  })

  describe('adjusted records that change period', () => {
    it('splits tonnage when a record moves from closed to open', () => {
      // Old data: DATE_RECEIVED_FOR_REPROCESSING = Jan (closed)
      // New data: DATE_RECEIVED_FOR_REPROCESSING = Feb (open)
      // The old +10 must be reversed from closed, the new +12 added to open.
      const oldRecord = /** @type {WasteRecord} */ (
        /** @type {unknown} */ ({
          type: 'received',
          rowId: '1000',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15' }
        })
      )

      const wasteRecords = [
        buildWasteRecord({
          change: 'UPDATED',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-02-20' }
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'monthly', period: 1 })
        ],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 10, newAmount: 12 }]
        ]),
        existingRecordsMap: new Map([['received:1000', oldRecord]])
      })

      expect(result.closed?.adjusted?.included.tonnageDelta).toBe(-10)
      expect(result.open?.adjusted?.included.tonnageDelta).toBe(12)
    })

    it('collapses to net delta when the period does not change', () => {
      // Old and new both in Jan (closed). Should behave like today: net delta.
      const oldRecord = /** @type {WasteRecord} */ (
        /** @type {unknown} */ ({
          type: 'received',
          rowId: '1000',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-10' }
        })
      )

      const wasteRecords = [
        buildWasteRecord({
          change: 'UPDATED',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-20' }
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'monthly', period: 1 })
        ],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 10, newAmount: 12 }]
        ]),
        existingRecordsMap: new Map([['received:1000', oldRecord]])
      })

      // 12 - 10 = +2 net in closed
      expect(result.closed?.adjusted?.included.tonnageDelta).toBe(2)
      expect(result.open).toEqual(emptyPeriod())
    })

    it('reverses old period tonnage when all dates are removed', () => {
      // Old data had Jan date (closed), new data has no dates.
      // Closed period loses the old contribution, record is otherwise skipped.
      const oldRecord = /** @type {WasteRecord} */ (
        /** @type {unknown} */ ({
          type: 'received',
          rowId: '1000',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15' }
        })
      )

      const wasteRecords = [
        buildWasteRecord({
          change: 'UPDATED',
          data: { DATE_RECEIVED_FOR_REPROCESSING: null }
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'monthly', period: 1 })
        ],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 10, newAmount: 0 }]
        ]),
        existingRecordsMap: new Map([['received:1000', oldRecord]])
      })

      expect(result.closed?.adjusted?.included.tonnageDelta).toBe(-10)
      expect(result.open).toEqual(emptyPeriod())
    })

    it('attributes full new amount when no old record exists', () => {
      // No old record in existingRecordsMap (e.g. first upload adjusted a
      // row that was created in the same batch). Only new period gets tonnage.
      const wasteRecords = [
        buildWasteRecord({
          change: 'UPDATED',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-02-20' }
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'monthly', period: 1 })
        ],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 8 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.open?.adjusted?.included.tonnageDelta).toBe(8)
      expect(result.closed).toEqual(emptyPeriod())
    })

    it('skips counting when neither old nor new data has dates', () => {
      const oldRecord = /** @type {WasteRecord} */ (
        /** @type {unknown} */ ({
          type: 'received',
          rowId: '1000',
          data: { DATE_RECEIVED_FOR_REPROCESSING: null }
        })
      )

      const wasteRecords = [
        buildWasteRecord({
          change: 'UPDATED',
          data: { DATE_RECEIVED_FOR_REPROCESSING: null }
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map([['received:1000', oldRecord]])
      })

      expect(result).toEqual(emptyResult())
    })

    it('treats missing transactionAmounts entry as zero for adjusted record', () => {
      const oldRecord = /** @type {WasteRecord} */ (
        /** @type {unknown} */ ({
          type: 'received',
          rowId: '1000',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15' }
        })
      )

      const wasteRecords = [
        buildWasteRecord({
          change: 'UPDATED',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-02-20' }
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map([['received:1000', oldRecord]])
      })

      expect(result.open?.adjusted?.included.tonnageDelta).toBe(0)
      expect(result.closed).toEqual(emptyPeriod())
    })
  })

  describe('skipped records', () => {
    it('skips unchanged records', () => {
      const wasteRecords = [buildWasteRecord({ summaryLogId: 'other-sl' })]
      // Last version belongs to a different summary log => unchanged
      wasteRecords[0].record.versions =
        /** @type {ValidatedWasteRecord['record']['versions']} */ ([
          {
            summaryLog: { id: 'other-sl', uri: 's3://bucket/old' },
            status: VERSION_STATUS.CREATED
          }
        ])

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result).toEqual(emptyResult())
    })

    it('skips IGNORED records', () => {
      const wasteRecords = [buildWasteRecord({ outcome: ROW_OUTCOME.IGNORED })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result).toEqual(emptyResult())
    })

    it('skips records with no matching table schema', () => {
      const wasteRecords = [buildWasteRecord({ tableName: 'UNKNOWN_TABLE' })]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result).toEqual(emptyResult())
    })
  })

  describe('edge cases', () => {
    it('returns empty result when no waste records', () => {
      const result = classifyByPeriodStatus({
        wasteRecords: [],
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result).toEqual(emptyResult())
    })

    it('accumulates tonnage across multiple included records', () => {
      const wasteRecords = [
        buildWasteRecord({ rowId: '1000' }),
        buildWasteRecord({
          rowId: '1001',
          data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-20' }
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map([
          ['received:1000', { oldAmount: 0, newAmount: 7.5 }],
          ['received:1001', { oldAmount: 0, newAmount: 2.5 }]
        ]),
        existingRecordsMap: new Map()
      })

      expect(result.open?.added?.included.tonnageDelta).toBe(10)
      expect(result.open?.added?.included.count).toBe(2)
    })

    it('defaults to zero tonnageDelta when transactionAmounts has no entry', () => {
      const wasteRecords = [buildWasteRecord()]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result.open?.added?.included.tonnageDelta).toBe(0)
      expect(result.open?.added?.included.count).toBe(1)
    })

    it('ignores submitted reports for a different cadence', () => {
      const wasteRecords = [buildWasteRecord()]

      // Accredited => monthly, but reports are quarterly
      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [
          buildSubmittedReport({ cadence: 'quarterly', period: 1 })
        ],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result.open?.added?.included.tonnageDelta).toBe(0)
      expect(result.closed).toEqual(emptyPeriod())
    })

    it('treats in_progress reports as open', () => {
      const wasteRecords = [buildWasteRecord()]

      /** @type {PeriodicReport[]} */
      const submittedReports = [
        {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2026,
          reports: {
            monthly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                dueDate: '2026-02-20',
                current: {
                  id: 'r-1',
                  status: 'in_progress',
                  submissionNumber: 1,
                  submittedAt: null,
                  submittedBy: null
                },
                previousSubmissions: []
              }
            }
          }
        }
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports,
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result.open?.added?.included.tonnageDelta).toBe(0)
      expect(result.closed).toEqual(emptyPeriod())
    })

    it('handles Date objects as date values', () => {
      const wasteRecords = [
        buildWasteRecord({
          data: {
            DATE_RECEIVED_FOR_REPROCESSING: new Date('2026-01-15')
          }
        })
      ]

      const result = classifyByPeriodStatus({
        wasteRecords,
        summaryLogId: SUMMARY_LOG_ID,
        registration: accreditedRegistration,
        submittedReports: [],
        tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
        transactionAmounts: new Map(),
        existingRecordsMap: new Map()
      })

      expect(result.open?.added?.included.tonnageDelta).toBe(0)
    })
  })
})

describe('buildTransactionAmounts', () => {
  /** @type {import('./period-status.js').ClassificationContext} */
  const stubContext = {
    accreditation: null,
    overseasSites: ORS_VALIDATION_DISABLED
  }

  /**
   * Minimal schema stub that returns a fixed transaction amount.
   *
   * @param {number} amount
   */
  /** @param {number} amount */
  const stubSchema = (amount) =>
    /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: () => ({
          outcome: ROW_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: amount
        })
      })
    )

  const stubSchemaExcluded = () =>
    /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: () => ({
          outcome: ROW_OUTCOME.EXCLUDED,
          reasons: [{ code: 'MISSING_REQUIRED_FIELD' }]
        })
      })
    )

  it('forwards classification context to classifyForWasteBalance', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const classifyForWasteBalance = vi.fn().mockReturnValue({
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 10
    })

    /** @type {import('./period-status.js').ClassificationContext} */
    const context = {
      accreditation:
        /** @type {import('#domain/organisations/accreditation.js').Accreditation} */ (
          /** @type {unknown} */ ({ status: 'approved' })
        ),
      overseasSites: ORS_VALIDATION_DISABLED
    }

    buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () =>
        /** @type {TableSchema} */ (
          /** @type {unknown} */ ({ classifyForWasteBalance })
        ),
      context
    })

    expect(classifyForWasteBalance).toHaveBeenCalledWith(
      expect.any(Object),
      context
    )
  })

  it('returns the full transaction amount for added records', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchema(10),
      context: stubContext
    })

    expect(result.get('received:1000')).toEqual({ oldAmount: 0, newAmount: 10 })
  })

  it('returns old and new amounts for adjusted records', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({
        rowId: '1000',
        change: 'UPDATED',
        data: { NET_WEIGHT: '15' }
      })
    ]

    const existingRecord = /** @type {WasteRecord} */ (
      /** @type {unknown} */ ({
        type: 'received',
        rowId: '1000',
        data: { NET_WEIGHT: '10' }
      })
    )

    /** Schema stub that reads NET_WEIGHT from data */
    const dataSensitiveSchema = /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => ({
          outcome: ROW_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: Number(data.NET_WEIGHT)
        })
      })
    )

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map([['received:1000', existingRecord]]),
      findSchema: () => dataSensitiveSchema,
      context: stubContext
    })

    expect(result.get('received:1000')).toEqual({
      oldAmount: 10,
      newAmount: 15
    })
  })

  it('skips records where classification returns zero', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchema(0),
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('skips adjusted records where both old and new amounts are zero', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'UPDATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchema(0),
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('returns null when findSchema returns null', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => null,
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('skips records that are not INCLUDED by classification', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchemaExcluded(),
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('skips added excluded records (no prior contribution to reverse)', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({
        rowId: '1000',
        change: 'CREATED',
        outcome: ROW_OUTCOME.EXCLUDED
      })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchema(10),
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('returns negative delta when an adjusted record becomes excluded', () => {
    // Record was previously included at 10 tonnes, now excluded.
    // Delta should be 0 (new, excluded) - 10 (old, included) = -10.
    const wasteBalanceRecords = [
      buildWasteRecord({
        rowId: '1000',
        change: 'UPDATED',
        outcome: ROW_OUTCOME.EXCLUDED,
        data: { NET_WEIGHT: '' }
      })
    ]

    const existingRecord = /** @type {WasteRecord} */ (
      /** @type {unknown} */ ({
        type: 'received',
        rowId: '1000',
        data: { NET_WEIGHT: '10' }
      })
    )

    const dataSensitiveSchema = /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => {
          const weight = Number(data.NET_WEIGHT)
          if (!weight) {
            return { outcome: ROW_OUTCOME.EXCLUDED, reasons: [] }
          }
          return {
            outcome: ROW_OUTCOME.INCLUDED,
            reasons: [],
            transactionAmount: weight
          }
        }
      })
    )

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map([['received:1000', existingRecord]]),
      findSchema: () => dataSensitiveSchema,
      context: stubContext
    })

    expect(result.get('received:1000')).toEqual({ oldAmount: 10, newAmount: 0 })
  })

  it('uses zero as old amount when no existing record found for adjusted record', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({
        rowId: '1000',
        change: 'UPDATED',
        data: { NET_WEIGHT: '15' }
      })
    ]

    const dataSensitiveSchema = /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => ({
          outcome: ROW_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: Number(data.NET_WEIGHT)
        })
      })
    )

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => dataSensitiveSchema,
      context: stubContext
    })

    expect(result.get('received:1000')).toEqual({ oldAmount: 0, newAmount: 15 })
  })
})
