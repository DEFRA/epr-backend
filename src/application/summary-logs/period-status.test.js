import { describe, expect, it } from 'vitest'
import { classifyByPeriodStatus } from './period-status.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { MAX_ROWS_PER_BUCKET } from '#domain/summary-logs/loads-by-period-status-schema.js'
import { RECORD_CHANGE } from './record-change.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {WasteRecordState} from '#waste-records/application/read-summary-log-row-states.js' */
/** @import {ClassificationContext, ProcessingTypeSchemas} from './period-status.js' */
/** @import {RecordChange} from './record-change.js' */

/**
 * @param {Partial<{
 *   rowId: string,
 *   type: string,
 *   data: Record<string, string | null>,
 *   outcome: string,
 *   tableName: string,
 *   change: RecordChange
 * }>} [overrides]
 * @returns {ValidatedWasteRecord & { change: RecordChange }}
 */
const buildWasteRecord = ({
  rowId = '10001',
  type = 'received',
  data = { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15', GROSS_WEIGHT: '42.5' },
  outcome = ROW_OUTCOME.INCLUDED,
  tableName = 'RECEIVED_LOADS_FOR_REPROCESSING',
  change = RECORD_CHANGE.ADDED
} = {}) =>
  /** @type {any} */ ({
    record: { type, rowId, data },
    outcome,
    tableName,
    issues: [],
    change
  })

/**
 * A submitted row state as the read model exposes it: its `data` gives the old
 * period of an adjusted row, and its stamped `classification.transactionAmount`
 * gives the old balance amount — mirroring the stub schema so a state built from
 * a row's data carries the same amount that row would classify to.
 * @param {{ rowId?: string, type?: string, data: Record<string, string | null> }} params
 * @returns {[string, WasteRecordState]}
 */
const submittedState = ({ rowId = '10001', type = 'received', data }) => [
  `${type}:${rowId}`,
  /** @type {any} */ ({
    rowId,
    wasteRecordType: type,
    data,
    classification: {
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: Number(data.GROSS_WEIGHT) || 0
    }
  })
]

/** @type {ProcessingTypeSchemas} Single-date-field table schemas (most tables). */
const SINGLE_DATE_TABLE_SCHEMAS = /** @type {ProcessingTypeSchemas} */ (
  /** @type {unknown} */ ({
    RECEIVED_LOADS_FOR_REPROCESSING: {
      reportingDateFields: ['DATE_RECEIVED_FOR_REPROCESSING'],
      wasteRecordType: 'received',
      sheetName: 'Received',
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
      sheetName: 'Received',
      classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => ({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: Number(data.GROSS_WEIGHT) || 0
      })
    }
  })
)

const emptyChange = () => ({
  balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
  nonBalanceAffecting: { count: 0, rows: [] }
})
const emptyPeriod = () => ({
  added: emptyChange(),
  adjusted: emptyChange()
})
const emptyResult = () => ({
  openPeriodLoads: emptyPeriod(),
  closedPeriodLoads: emptyPeriod(),
  closedPeriods: []
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
  cadence: /** @type {'monthly' | 'quarterly'} */ ('monthly'),
  tableSchemas: SINGLE_DATE_TABLE_SCHEMAS,
  classificationContext,
  submittedRowStatesByKey: /** @type {Map<string, WasteRecordState>} */ (
    new Map()
  ),
  periodicReports: /** @type {PeriodicReport[]} */ ([])
}

/**
 * Runs the projection, deriving the record-change map each waste record carries.
 * @param {{ wasteRecords: Array<ValidatedWasteRecord & { change: RecordChange }> } & Record<string, any>} params
 */
const run = ({ wasteRecords, ...overrides }) =>
  classifyByPeriodStatus({
    ...baseParams,
    ...overrides,
    wasteRecords,
    recordChanges: new Map(
      wasteRecords.map(({ record, change }) => [
        `${record.type}:${record.rowId}`,
        change
      ])
    )
  })

describe('classifyByPeriodStatus', () => {
  it('returns all-zero structure for empty waste records', () => {
    expect(run({ wasteRecords: [] })).toEqual(emptyResult())
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
      const result = run({
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
        tonnageDelta: 0.3,
        rows: [
          {
            rowId: '10001',
            wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
            exclusionReasons: [],
            tonnageDelta: 0.1
          },
          {
            rowId: '10002',
            wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
            exclusionReasons: [],
            tonnageDelta: 0.2
          }
        ]
      })
    })

    it('caps a bucket rows list at 100 while count keeps the true total', () => {
      // Zero-tonnage loads are balance-neutral, so they land in
      // nonBalanceAffecting, which lists rows. One more than the cap overflows.
      const overCap = MAX_ROWS_PER_BUCKET + 1
      const wasteRecords = Array.from({ length: overCap }, (_, index) =>
        buildWasteRecord({
          rowId: String(10001 + index),
          data: {
            DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15',
            GROSS_WEIGHT: '0'
          }
        })
      )

      const result = run({ wasteRecords })

      const bucket = result.openPeriodLoads.added.nonBalanceAffecting
      expect(bucket.count).toBe(overCap)
      expect(bucket.rows).toHaveLength(MAX_ROWS_PER_BUCKET)
    })
  })

  describe('adjusted records', () => {
    // The operator-meaningful adjusted outcomes (same-period net delta,
    // net-zero corrections, cross-period moves and included-to-excluded
    // reversals) are exercised at integration level via the submit-then-
    // reupload flow. The cases below cover edges that flow cannot reach
    // directly: blanked dates, missing submitted records and all-null dates.

    it('assigns count to old period when new date is blanked out', () => {
      const submittedRowStatesByKey = new Map([
        submittedState({
          data: {
            DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
            GROSS_WEIGHT: '30'
          }
        })
      ])

      const result = run({
        submittedRowStatesByKey,
        wasteRecords: [
          buildWasteRecord({
            change: RECORD_CHANGE.ADJUSTED,
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: null,
              GROSS_WEIGHT: '0'
            }
          })
        ]
      })

      // New date is null so newPeriod is null; count goes to old period
      expect(result.openPeriodLoads.adjusted.balanceAffecting.count).toBe(1)
      expect(
        result.openPeriodLoads.adjusted.balanceAffecting.tonnageDelta
      ).toBe(-30)
    })

    it('handles adjusted record with no submitted record in the map', () => {
      const result = run({
        wasteRecords: [
          buildWasteRecord({
            change: RECORD_CHANGE.ADJUSTED,
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-15',
              GROSS_WEIGHT: '50'
            }
          })
        ]
      })

      // No submitted record so oldPeriod is null, oldAmount is 0
      expect(result.openPeriodLoads.adjusted.balanceAffecting).toEqual({
        count: 1,
        tonnageDelta: 50,
        rows: [
          {
            rowId: '10001',
            wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
            exclusionReasons: [],
            tonnageDelta: 50
          }
        ]
      })
    })

    it('produces no entries when both new and submitted records have no date', () => {
      const submittedRowStatesByKey = new Map([
        submittedState({
          data: {
            DATE_RECEIVED_FOR_REPROCESSING: null,
            GROSS_WEIGHT: '30'
          }
        })
      ])

      const result = run({
        submittedRowStatesByKey,
        wasteRecords: [
          buildWasteRecord({
            change: RECORD_CHANGE.ADJUSTED,
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: null,
              GROSS_WEIGHT: '50'
            }
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
      const result = run({
        wasteRecords: [buildWasteRecord({ outcome: ROW_OUTCOME.IGNORED })]
      })

      expect(result).toEqual(emptyResult())
    })

    it('skips unchanged records (matching the latest submitted state)', () => {
      const result = run({
        wasteRecords: [buildWasteRecord({ change: RECORD_CHANGE.UNCHANGED })]
      })

      expect(result).toEqual(emptyResult())
    })

    it('skips records with no matching table schema', () => {
      const result = run({
        wasteRecords: [buildWasteRecord({ tableName: 'UNKNOWN_TABLE' })]
      })

      expect(result).toEqual(emptyResult())
    })

    it('skips records with no date field values', () => {
      const result = run({
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
      const result = run({
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
        tonnageDelta: 10,
        rows: [
          {
            rowId: '10001',
            wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
            exclusionReasons: [],
            tonnageDelta: 10
          }
        ]
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

      const result = run({
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

      const result = run({
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

      const result = run({
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

      const result = run({
        periodicReports: [report],
        wasteRecords: [buildWasteRecord()]
      })

      expect(result.closedPeriodLoads.added.balanceAffecting.count).toBe(1)
    })
  })

  describe('Date object date values', () => {
    it('handles Date objects in reporting date fields', () => {
      const result = run({
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
        tonnageDelta: 10,
        rows: [
          {
            rowId: '10001',
            wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
            exclusionReasons: [],
            tonnageDelta: 10
          }
        ]
      })
    })
  })

  describe('closed periods', () => {
    const submittedJan = buildSubmittedReport({ period: 1, year: 2026 })

    it('returns the distinct closed periods that received added loads', () => {
      const result = run({
        periodicReports: [submittedJan],
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15',
              GROSS_WEIGHT: '42.5'
            }
          })
        ]
      })

      expect(result.closedPeriods).toEqual([
        { year: 2026, cadence: 'monthly', period: 1 }
      ])
    })

    it('deduplicates a period touched by more than one load', () => {
      const result = run({
        periodicReports: [submittedJan],
        wasteRecords: [
          buildWasteRecord({
            rowId: '10001',
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-01-10',
              GROSS_WEIGHT: '10'
            }
          }),
          buildWasteRecord({
            rowId: '10002',
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-01-20',
              GROSS_WEIGHT: '20'
            }
          })
        ]
      })

      expect(result.closedPeriods).toEqual([
        { year: 2026, cadence: 'monthly', period: 1 }
      ])
    })

    it('includes the closed period a load was moved out of', () => {
      const submittedRowStatesByKey = new Map([
        submittedState({
          data: {
            DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15',
            GROSS_WEIGHT: '30'
          }
        })
      ])

      const result = run({
        periodicReports: [submittedJan],
        submittedRowStatesByKey,
        wasteRecords: [
          buildWasteRecord({
            change: RECORD_CHANGE.ADJUSTED,
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-15',
              GROSS_WEIGHT: '30'
            }
          })
        ]
      })

      expect(result.closedPeriods).toEqual([
        { year: 2026, cadence: 'monthly', period: 1 }
      ])
    })

    it('is empty when no loads fall in a closed period', () => {
      const result = run({
        periodicReports: [submittedJan],
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-15',
              GROSS_WEIGHT: '10'
            }
          })
        ]
      })

      expect(result.closedPeriods).toEqual([])
    })
  })
})
