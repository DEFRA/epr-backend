import { describe, expect, it } from 'vitest'
import { classifyByPeriodStatus } from './period-status.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {ClassificationContext, ProcessingTypeSchemas} from './period-status.js' */

const SUMMARY_LOG_ID = 'sl-1'

/**
 * @param {Partial<{
 *   rowId: string,
 *   type: string,
 *   data: Record<string, string | null>,
 *   outcome: string,
 *   tableName: string,
 *   versionStatus: string,
 *   summaryLogId: string,
 *   previousVersions: Array<{ summaryLog: { id: string }, status: string, data: Record<string, string | null> }>
 * }>} [overrides]
 * @returns {ValidatedWasteRecord}
 */
const buildWasteRecord = ({
  rowId = '10001',
  type = 'received',
  data = { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15', GROSS_WEIGHT: '42.5' },
  outcome = ROW_OUTCOME.INCLUDED,
  tableName = 'RECEIVED_LOADS_FOR_REPROCESSING',
  versionStatus = VERSION_STATUS.CREATED,
  summaryLogId = SUMMARY_LOG_ID,
  previousVersions = []
} = {}) =>
  /** @type {ValidatedWasteRecord} */ (
    /** @type {unknown} */ ({
      record: {
        type,
        rowId,
        data,
        versions: [
          ...previousVersions.map((v) => ({
            id: `v-prev-${Math.random()}`,
            createdAt: '2026-01-01T00:00:00Z',
            summaryLog: v.summaryLog,
            status: v.status,
            data: v.data
          })),
          {
            id: 'v-1',
            createdAt: '2026-01-15T00:00:00Z',
            summaryLog: { id: summaryLogId },
            status: versionStatus,
            data
          }
        ]
      },
      outcome,
      tableName,
      issues: []
    })
  )

/** @type {ProcessingTypeSchemas} Single-date-field table schemas (most tables). */
const SINGLE_DATE_TABLE_SCHEMAS = /** @type {ProcessingTypeSchemas} */ (
  /** @type {unknown} */ ({
    RECEIVED_LOADS_FOR_REPROCESSING: {
      reportingDateFields: ['DATE_RECEIVED_FOR_REPROCESSING'],
      wasteRecordType: 'received',
      classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => ({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: Number(data.GROSS_WEIGHT) || 0
      })
    }
  })
)

/** @type {ProcessingTypeSchemas} Registered-only table schemas (monthly dates as YYYY-MM). */
const REGISTERED_ONLY_TABLE_SCHEMAS = /** @type {ProcessingTypeSchemas} */ (
  /** @type {unknown} */ ({
    RECEIVED_LOADS_FOR_REPROCESSING: {
      reportingDateFields: ['MONTH_RECEIVED_FOR_REPROCESSING'],
      wasteRecordType: 'received',
      classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => ({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: Number(data.GROSS_WEIGHT) || 0
      })
    }
  })
)

const emptyChange = () => ({
  balanceAffecting: { count: 0, tonnageDelta: 0 },
  nonBalanceAffecting: { count: 0 }
})
const emptyPeriod = () => ({
  added: emptyChange(),
  adjusted: emptyChange()
})
const emptyResult = () => ({
  openPeriodLoads: emptyPeriod(),
  closedPeriodLoads: emptyPeriod()
})

/**
 * @param {{ cadence?: string, period?: number, year?: number }} [opts]
 * @returns {PeriodicReport}
 */
const buildSubmittedReport = ({
  cadence = 'monthly',
  period = 1,
  year = 2026
} = {}) =>
  /** @type {PeriodicReport} */ (
    /** @type {unknown} */ ({
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
  )

const classificationContext = /** @type {ClassificationContext} */ (
  /** @type {unknown} */ ({
    accreditation: { status: 'approved', validFrom: '2025-01-01' },
    overseasSites: Symbol('ORS_DISABLED')
  })
)

const baseParams = {
  summaryLogId: SUMMARY_LOG_ID,
  cadence: /** @type {'monthly' | 'quarterly'} */ ('monthly'),
  tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
  classificationContext,
  existingRecordsMap: /** @type {Map<string, WasteRecord>} */ (new Map()),
  periodicReports: /** @type {PeriodicReport[]} */ ([])
}

describe('classifyByPeriodStatus', () => {
  it('returns all-zero structure for empty waste records', () => {
    const result = classifyByPeriodStatus({
      ...baseParams,
      wasteRecords: []
    })

    expect(result).toEqual(emptyResult())
  })

  describe('added records', () => {
    // Operator-meaningful added-load behaviour (open period, closed period, and
    // the balance-excluded -> nonBalanceAffecting split) is exercised at
    // integration level in
    // routes/.../summary-logs/integration.loads-by-period-status.test.js.
    // Only edges unreachable there remain here.

    it('rounds summed tonnageDelta to 2dp so no float noise leaks out', () => {
      // 0.1 + 0.2 = 0.30000000000000004 in IEEE-754. Tonnages are reported
      // to 2dp, so the aggregate must be the exact 0.3, not the noisy float.
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [
          buildWasteRecord({
            rowId: '10001',
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15',
              GROSS_WEIGHT: '0.1'
            }
          }),
          buildWasteRecord({
            rowId: '10002',
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15',
              GROSS_WEIGHT: '0.2'
            }
          })
        ]
      })

      expect(result.openPeriodLoads.added.balanceAffecting).toEqual({
        count: 2,
        tonnageDelta: 0.3
      })
    })
  })

  describe('adjusted records', () => {
    // The same-period net-delta happy path (re-upload of an existing load) is
    // exercised at integration level. The cases below cover edges that the
    // integration submit-then-reupload flow cannot reach directly: net-zero
    // adjustments, cross-period moves, blanked dates and missing existing
    // records.

    it('classifies a same-period adjust that nets to zero as nonBalanceAffecting', () => {
      const existingRecordsMap = new Map([
        [
          'received:10001',
          /** @type {WasteRecord} */ (
            /** @type {unknown} */ ({
              type: 'received',
              rowId: '10001',
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
                GROSS_WEIGHT: '30'
              }
            })
          )
        ]
      ])

      const result = classifyByPeriodStatus({
        ...baseParams,
        existingRecordsMap,
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-15',
              GROSS_WEIGHT: '30'
            },
            versionStatus: VERSION_STATUS.UPDATED,
            previousVersions: [
              {
                summaryLog: { id: 'sl-old' },
                status: VERSION_STATUS.CREATED,
                data: {
                  DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
                  GROSS_WEIGHT: '30'
                }
              }
            ]
          })
        ]
      })

      // Net delta = 30 - 30 = 0, so the row did not affect the balance.
      expect(result.openPeriodLoads.adjusted.balanceAffecting.count).toBe(0)
      expect(result.openPeriodLoads.adjusted.nonBalanceAffecting.count).toBe(1)
    })

    it('splits into two entries when old and new dates are in different periods', () => {
      const existingRecordsMap = new Map([
        [
          'received:10001',
          /** @type {WasteRecord} */ (
            /** @type {unknown} */ ({
              type: 'received',
              rowId: '10001',
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-01-10',
                GROSS_WEIGHT: '30'
              }
            })
          )
        ]
      ])

      // January is closed, February is open
      const result = classifyByPeriodStatus({
        ...baseParams,
        existingRecordsMap,
        periodicReports: [buildSubmittedReport({ period: 1 })],
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-15',
              GROSS_WEIGHT: '50'
            },
            versionStatus: VERSION_STATUS.UPDATED,
            previousVersions: [
              {
                summaryLog: { id: 'sl-old' },
                status: VERSION_STATUS.CREATED,
                data: {
                  DATE_RECEIVED_FOR_REPROCESSING: '2026-01-10',
                  GROSS_WEIGHT: '30'
                }
              }
            ]
          })
        ]
      })

      // Old period (January, closed): -30
      expect(
        result.closedPeriodLoads.adjusted.balanceAffecting.tonnageDelta
      ).toBe(-30)
      // New period (February, open): +50
      expect(
        result.openPeriodLoads.adjusted.balanceAffecting.tonnageDelta
      ).toBe(50)
      // Each leg the record touches counts once, so both periods read count:1
      expect(result.openPeriodLoads.adjusted.balanceAffecting.count).toBe(1)
      expect(result.closedPeriodLoads.adjusted.balanceAffecting.count).toBe(1)
    })

    it('assigns count to old period when new date is blanked out', () => {
      const existingRecordsMap = new Map([
        [
          'received:10001',
          /** @type {WasteRecord} */ (
            /** @type {unknown} */ ({
              type: 'received',
              rowId: '10001',
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
                GROSS_WEIGHT: '30'
              }
            })
          )
        ]
      ])

      const result = classifyByPeriodStatus({
        ...baseParams,
        existingRecordsMap,
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: null,
              GROSS_WEIGHT: '0'
            },
            versionStatus: VERSION_STATUS.UPDATED,
            previousVersions: [
              {
                summaryLog: { id: 'sl-old' },
                status: VERSION_STATUS.CREATED,
                data: {
                  DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
                  GROSS_WEIGHT: '30'
                }
              }
            ]
          })
        ]
      })

      // New date is null so newPeriod is null; count goes to old period
      expect(result.openPeriodLoads.adjusted.balanceAffecting.count).toBe(1)
      expect(
        result.openPeriodLoads.adjusted.balanceAffecting.tonnageDelta
      ).toBe(-30)
    })

    it('handles adjusted record with no existing record in the map', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-15',
              GROSS_WEIGHT: '50'
            },
            versionStatus: VERSION_STATUS.UPDATED,
            previousVersions: [
              {
                summaryLog: { id: 'sl-old' },
                status: VERSION_STATUS.CREATED,
                data: {
                  DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
                  GROSS_WEIGHT: '30'
                }
              }
            ]
          })
        ]
      })

      // No existing record so oldPeriod is null, oldAmount is 0
      expect(result.openPeriodLoads.adjusted.balanceAffecting).toEqual({
        count: 1,
        tonnageDelta: 50
      })
    })

    it('keeps an included-to-excluded reversal in balanceAffecting', () => {
      const existingRecordsMap = new Map([
        [
          'received:10001',
          /** @type {WasteRecord} */ (
            /** @type {unknown} */ ({
              type: 'received',
              rowId: '10001',
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
                GROSS_WEIGHT: '30'
              }
            })
          )
        ]
      ])

      const result = classifyByPeriodStatus({
        ...baseParams,
        existingRecordsMap,
        wasteRecords: [
          buildWasteRecord({
            outcome: ROW_OUTCOME.EXCLUDED,
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-15',
              GROSS_WEIGHT: '0'
            },
            versionStatus: VERSION_STATUS.UPDATED,
            previousVersions: [
              {
                summaryLog: { id: 'sl-old' },
                status: VERSION_STATUS.CREATED,
                data: {
                  DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
                  GROSS_WEIGHT: '30'
                }
              }
            ]
          })
        ]
      })

      // Old amount was 30 (included), new amount is 0 (excluded), same period.
      // Net delta -30 moved the balance, so the row is balanceAffecting even
      // though its new version is excluded from the waste balance.
      expect(result.openPeriodLoads.adjusted.balanceAffecting).toEqual({
        count: 1,
        tonnageDelta: -30
      })
      expect(result.openPeriodLoads.adjusted.nonBalanceAffecting).toEqual({
        count: 0
      })
    })

    it('produces no entries when both new and existing records have no date', () => {
      const existingRecordsMap = new Map([
        [
          'received:10001',
          /** @type {WasteRecord} */ (
            /** @type {unknown} */ ({
              type: 'received',
              rowId: '10001',
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: null,
                GROSS_WEIGHT: '30'
              }
            })
          )
        ]
      ])

      const result = classifyByPeriodStatus({
        ...baseParams,
        existingRecordsMap,
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: null,
              GROSS_WEIGHT: '50'
            },
            versionStatus: VERSION_STATUS.UPDATED,
            previousVersions: [
              {
                summaryLog: { id: 'sl-old' },
                status: VERSION_STATUS.CREATED,
                data: {
                  DATE_RECEIVED_FOR_REPROCESSING: null,
                  GROSS_WEIGHT: '30'
                }
              }
            ]
          })
        ]
      })

      // Both new and old dates are null so classify returns null for both;
      // the record contributes nothing to any period bucket
      expect(result).toEqual(emptyResult())
    })
  })

  describe('skipped records', () => {
    it('skips IGNORED records', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [buildWasteRecord({ outcome: ROW_OUTCOME.IGNORED })]
      })

      expect(result).toEqual(emptyResult())
    })

    it('skips unchanged records (not touched by this summary log)', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [buildWasteRecord({ summaryLogId: 'sl-other' })]
      })

      expect(result).toEqual(emptyResult())
    })

    it('skips records with no matching table schema', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [buildWasteRecord({ tableName: 'UNKNOWN_TABLE' })]
      })

      expect(result).toEqual(emptyResult())
    })

    it('skips records with no date field values', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [
          buildWasteRecord({
            data: { DATE_RECEIVED_FOR_REPROCESSING: null, GROSS_WEIGHT: '10' }
          })
        ]
      })

      expect(result).toEqual(emptyResult())
    })
  })

  // Quarterly-cadence month-to-quarter bucketing (Q1 closed, Q2 open) is
  // exercised end to end by the registered-only scenario in
  // routes/.../summary-logs/integration.loads-by-period-status.test.js. This
  // unit case remains to pin the registered-only YYYY-MM month-only date
  // string, which the integration data (first-of-month dates) does not cover.
  describe('registered-only YYYY-MM date format', () => {
    it('handles month-only dates correctly', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        cadence: 'quarterly',
        tableSchemas: REGISTERED_ONLY_TABLE_SCHEMAS,
        periodicReports: [
          buildSubmittedReport({ cadence: 'quarterly', period: 1 })
        ],
        wasteRecords: [
          buildWasteRecord({
            data: {
              MONTH_RECEIVED_FOR_REPROCESSING: '2026-01',
              GROSS_WEIGHT: '10'
            },
            tableName: 'RECEIVED_LOADS_FOR_REPROCESSING'
          })
        ]
      })

      expect(result.closedPeriodLoads.added.balanceAffecting).toEqual({
        count: 1,
        tonnageDelta: 10
      })
    })
  })

  describe('cadence mismatch in periodic reports', () => {
    it('ignores periodic reports that do not have the requested cadence', () => {
      // Quarterly report but monthly cadence requested
      const report = /** @type {PeriodicReport} */ (
        /** @type {unknown} */ ({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2026,
          reports: {
            quarterly: {
              1: {
                current: null,
                previousSubmissions: [{ id: 'r-1', status: 'submitted' }]
              }
            }
          }
        })
      )

      const result = classifyByPeriodStatus({
        ...baseParams,
        cadence: 'monthly',
        periodicReports: [report],
        wasteRecords: [buildWasteRecord()]
      })

      // The report is quarterly but cadence is monthly, so no periods are closed
      expect(result.openPeriodLoads.added.balanceAffecting.count).toBe(1)
    })
  })

  describe('period open when report exists but is not submitted', () => {
    it('treats a period as open when report is in_progress with no previous submissions', () => {
      const report = /** @type {PeriodicReport} */ (
        /** @type {unknown} */ ({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2026,
          reports: {
            monthly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                dueDate: '2026-02-20',
                current: { status: 'in_progress', submissionNumber: 0 },
                previousSubmissions: []
              }
            }
          }
        })
      )

      const result = classifyByPeriodStatus({
        ...baseParams,
        periodicReports: [report],
        wasteRecords: [buildWasteRecord()]
      })

      expect(result.openPeriodLoads.added.balanceAffecting.count).toBe(1)
      expect(result.closedPeriodLoads.added.balanceAffecting.count).toBe(0)
    })
  })

  describe('transaction amount for non-INCLUDED classification', () => {
    it('uses zero transaction amount when classifyForWasteBalance returns EXCLUDED', () => {
      const schemasWithExcluded = /** @type {ProcessingTypeSchemas} */ (
        /** @type {unknown} */ ({
          RECEIVED_LOADS_FOR_REPROCESSING: {
            ...SINGLE_DATE_TABLE_SCHEMAS.RECEIVED_LOADS_FOR_REPROCESSING,
            classifyForWasteBalance: () => ({
              outcome: ROW_OUTCOME.EXCLUDED,
              reasons: []
            })
          }
        })
      )

      const result = classifyByPeriodStatus({
        ...baseParams,
        tableSchemas: schemasWithExcluded,
        wasteRecords: [buildWasteRecord()]
      })

      // Record is INCLUDED per outcome but schema returns EXCLUDED for amount
      // so tonnageDelta should be 0
      expect(result.openPeriodLoads.added.balanceAffecting.tonnageDelta).toBe(0)
    })
  })

  describe('period closed by current submission status', () => {
    it('treats a period as closed when current report status is submitted', () => {
      const report = /** @type {PeriodicReport} */ (
        /** @type {unknown} */ ({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2026,
          reports: {
            monthly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                dueDate: '2026-02-20',
                current: { status: 'submitted', submissionNumber: 1 },
                previousSubmissions: []
              }
            }
          }
        })
      )

      const result = classifyByPeriodStatus({
        ...baseParams,
        periodicReports: [report],
        wasteRecords: [buildWasteRecord()]
      })

      expect(result.closedPeriodLoads.added.balanceAffecting.count).toBe(1)
    })
  })

  describe('Date object date values', () => {
    it('handles Date objects in reporting date fields', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: /** @type {any} */ (
                new Date('2026-01-15T00:00:00Z')
              ),
              GROSS_WEIGHT: '10'
            }
          })
        ]
      })

      expect(result.openPeriodLoads.added.balanceAffecting).toEqual({
        count: 1,
        tonnageDelta: 10
      })
    })
  })
})
