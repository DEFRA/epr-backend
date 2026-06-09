import { describe, expect, it } from 'vitest'
import { classifyByPeriodStatus } from './period-status.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {ClassificationContext} from './period-status.js' */

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

/** @type {Record<string, TableSchema>} Single-date-field table schemas (most tables). */
const SINGLE_DATE_TABLE_SCHEMAS = /** @type {Record<string, TableSchema>} */ (
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

/** @type {Record<string, TableSchema>} Multi-date-field table schemas (exporter received-loads). */
const MULTI_DATE_TABLE_SCHEMAS = /** @type {Record<string, TableSchema>} */ (
  /** @type {unknown} */ ({
    RECEIVED_LOADS_FOR_EXPORT: {
      reportingDateFields: ['DATE_RECEIVED_FOR_EXPORT', 'DATE_OF_EXPORT'],
      wasteRecordType: 'received',
      classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => ({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: Number(data.GROSS_WEIGHT) || 0
      })
    }
  })
)

/** @type {Record<string, TableSchema>} Registered-only table schemas (monthly dates as YYYY-MM). */
const REGISTERED_ONLY_TABLE_SCHEMAS =
  /** @type {Record<string, TableSchema>} */ (
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

const emptyBucket = () => ({ count: 0, tonnageDelta: 0 })
const emptyChange = () => ({
  included: emptyBucket(),
  excluded: emptyBucket()
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
    it('classifies an added included record into the open period', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [buildWasteRecord()]
      })

      expect(result.open.added.included).toEqual({
        count: 1,
        tonnageDelta: 42.5
      })
    })

    it('classifies an added included record into the closed period', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [buildWasteRecord()],
        periodicReports: [buildSubmittedReport()]
      })

      expect(result.closed.added.included).toEqual({
        count: 1,
        tonnageDelta: 42.5
      })
    })

    it('classifies an added excluded record with zero tonnageDelta', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [buildWasteRecord({ outcome: ROW_OUTCOME.EXCLUDED })]
      })

      expect(result.open.added.excluded).toEqual({
        count: 1,
        tonnageDelta: 0
      })
    })
  })

  describe('adjusted records', () => {
    it('computes net delta when the period is unchanged', () => {
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

      // Same period (February, open) so net delta = 50 - 30 = 20
      expect(result.open.adjusted.included).toEqual({
        count: 1,
        tonnageDelta: 20
      })
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
      expect(result.closed.adjusted.included.tonnageDelta).toBe(-30)
      // New period (February, open): +50
      expect(result.open.adjusted.included.tonnageDelta).toBe(50)
      // Count goes to the new period
      expect(result.open.adjusted.included.count).toBe(1)
      expect(result.closed.adjusted.included.count).toBe(0)
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
      expect(result.open.adjusted.included.count).toBe(1)
      expect(result.open.adjusted.included.tonnageDelta).toBe(-30)
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
      expect(result.open.adjusted.included).toEqual({
        count: 1,
        tonnageDelta: 50
      })
    })

    it('handles included-to-excluded reversal with negative delta in old period', () => {
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

      // Record is now excluded, so it goes to excluded bucket
      // Old amount was 30 (included), new amount is 0 (excluded)
      // Net delta: 0 - 30 = -30
      expect(result.open.adjusted.excluded).toEqual({
        count: 1,
        tonnageDelta: -30
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

  describe('closed-wins rule (multiple reporting date fields)', () => {
    it('classifies a row as closed when one date is in a closed period and another is open', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        tableSchemas: MULTI_DATE_TABLE_SCHEMAS,
        periodicReports: [buildSubmittedReport({ period: 1 })],
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_EXPORT: '2026-01-15',
              DATE_OF_EXPORT: '2026-02-10',
              GROSS_WEIGHT: '42.5'
            },
            tableName: 'RECEIVED_LOADS_FOR_EXPORT'
          })
        ]
      })

      expect(result.closed.added.included.count).toBe(1)
      expect(result.open.added.included.count).toBe(0)
    })

    it('classifies a row as open when all dates are in open periods', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        tableSchemas: MULTI_DATE_TABLE_SCHEMAS,
        wasteRecords: [
          buildWasteRecord({
            data: {
              DATE_RECEIVED_FOR_EXPORT: '2026-02-15',
              DATE_OF_EXPORT: '2026-03-10',
              GROSS_WEIGHT: '42.5'
            },
            tableName: 'RECEIVED_LOADS_FOR_EXPORT'
          })
        ]
      })

      expect(result.open.added.included.count).toBe(1)
      expect(result.closed.added.included.count).toBe(0)
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

  describe('quarterly cadence', () => {
    it('maps months to quarterly periods correctly', () => {
      // March is Q1, April is Q2
      // Submit Q1 report, so March is closed, April is open
      const result = classifyByPeriodStatus({
        ...baseParams,
        cadence: 'quarterly',
        periodicReports: [
          buildSubmittedReport({ cadence: 'quarterly', period: 1 })
        ],
        wasteRecords: [
          buildWasteRecord({
            rowId: '10001',
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-03-15',
              GROSS_WEIGHT: '10'
            }
          }),
          buildWasteRecord({
            rowId: '10002',
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-04-15',
              GROSS_WEIGHT: '20'
            }
          })
        ]
      })

      expect(result.closed.added.included).toEqual({
        count: 1,
        tonnageDelta: 10
      })
      expect(result.open.added.included).toEqual({
        count: 1,
        tonnageDelta: 20
      })
    })
  })

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

      expect(result.closed.added.included).toEqual({
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
      expect(result.open.added.included.count).toBe(1)
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

      expect(result.open.added.included.count).toBe(1)
      expect(result.closed.added.included.count).toBe(0)
    })
  })

  describe('transaction amount for non-INCLUDED classification', () => {
    it('uses zero transaction amount when classifyForWasteBalance returns EXCLUDED', () => {
      const schemasWithExcluded = /** @type {Record<string, TableSchema>} */ (
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
      expect(result.open.added.included.tonnageDelta).toBe(0)
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

      expect(result.closed.added.included.count).toBe(1)
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

      expect(result.open.added.included).toEqual({
        count: 1,
        tonnageDelta: 10
      })
    })
  })

  describe('aggregation across multiple records', () => {
    it('sums counts and tonnageDelta across multiple records in the same bucket', () => {
      const result = classifyByPeriodStatus({
        ...baseParams,
        wasteRecords: [
          buildWasteRecord({
            rowId: '10001',
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10',
              GROSS_WEIGHT: '20'
            }
          }),
          buildWasteRecord({
            rowId: '10002',
            data: {
              DATE_RECEIVED_FOR_REPROCESSING: '2026-02-15',
              GROSS_WEIGHT: '30'
            }
          })
        ]
      })

      expect(result.open.added.included).toEqual({
        count: 2,
        tonnageDelta: 50
      })
    })
  })
})
