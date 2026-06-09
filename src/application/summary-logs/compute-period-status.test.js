import { describe, expect, it, vi } from 'vitest'
import { computePeriodStatus } from './compute-period-status.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ReportsRepository} from '#reports/repository/port.js' */
/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */

const SUMMARY_LOG_ID = 'sl-1'

const accreditedRegistration = /** @type {Registration} */ (
  /** @type {unknown} */ ({ accreditation: { status: 'approved' } })
)

const registeredOnlyRegistration = /** @type {Registration} */ (
  /** @type {unknown} */ ({})
)

const stubReportsRepository = /** @type {ReportsRepository} */ (
  /** @type {unknown} */ ({
    findPeriodicReports: async () => []
  })
)

const stubLogger = /** @type {TypedLogger} */ (
  /** @type {unknown} */ ({ warn: vi.fn() })
)

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

// Stub the PROCESSING_TYPE_TABLES import — vi.hoisted runs before vi.mock
const { stubbedProcessingTypeTables } = vi.hoisted(() => ({
  stubbedProcessingTypeTables:
    /** @type {typeof import('#domain/summary-logs/table-schemas/index.js').PROCESSING_TYPE_TABLES} */ (
      /** @type {unknown} */ ({
        REPROCESSOR_INPUT: {
          RECEIVED_LOADS_FOR_REPROCESSING: {
            reportingDateFields: ['DATE_RECEIVED_FOR_REPROCESSING'],
            wasteRecordType: 'received',
            classifyForWasteBalance: () => ({
              outcome: ROW_OUTCOME.INCLUDED,
              reasons: [],
              transactionAmount: 10
            })
          }
        }
      })
    )
}))

vi.mock(
  '#domain/summary-logs/table-schemas/index.js',
  async (importOriginal) => {
    const actual = /** @type {Record<string, unknown>} */ (
      await importOriginal()
    )
    return {
      ...actual,
      PROCESSING_TYPE_TABLES: stubbedProcessingTypeTables
    }
  }
)

const baseParams = {
  summaryLogId: SUMMARY_LOG_ID,
  status: 'validated',
  reportsRepository: stubReportsRepository,
  organisationId: 'org-1',
  registrationId: 'reg-1',
  loggingContext: 'test',
  logger: stubLogger
}

describe('computePeriodStatus', () => {
  it('returns classified loads when reports lookup succeeds', async () => {
    const wasteRecords = [buildWasteRecord()]
    const result = await computePeriodStatus({
      ...baseParams,
      wasteRecords,
      wasteBalanceRecords: wasteRecords,
      registration: accreditedRegistration,
      processingType: 'REPROCESSOR_INPUT',
      existingRecordsMap: new Map()
    })

    expect(result).not.toBeNull()
    expect(result?.open?.added?.included.tonnageDelta).toBe(10)
  })

  it('returns null and logs a warning when reports lookup fails', async () => {
    vi.mocked(stubLogger.warn).mockClear()
    const wasteRecords = [buildWasteRecord()]
    const failingRepo = /** @type {ReportsRepository} */ (
      /** @type {unknown} */ ({
        findPeriodicReports: async () => {
          throw new Error('database unavailable')
        }
      })
    )

    const result = await computePeriodStatus({
      ...baseParams,
      wasteRecords,
      wasteBalanceRecords: wasteRecords,
      registration: accreditedRegistration,
      processingType: 'REPROCESSOR_INPUT',
      existingRecordsMap: new Map(),
      reportsRepository: failingRepo
    })

    expect(result).toBeNull()
    expect(stubLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('test')
      })
    )
  })

  it('returns null when status is not validated', async () => {
    const result = await computePeriodStatus({
      ...baseParams,
      wasteRecords: [buildWasteRecord()],
      wasteBalanceRecords: [],
      registration: accreditedRegistration,
      processingType: 'REPROCESSOR_INPUT',
      existingRecordsMap: new Map(),
      status: 'invalid'
    })

    expect(result).toBeNull()
  })

  it('returns null when wasteRecords is null', async () => {
    const result = await computePeriodStatus({
      ...baseParams,
      wasteRecords: null,
      wasteBalanceRecords: [],
      registration: accreditedRegistration,
      processingType: 'REPROCESSOR_INPUT',
      existingRecordsMap: new Map()
    })

    expect(result).toBeNull()
  })

  it('returns null when registration is missing', async () => {
    const result = await computePeriodStatus({
      ...baseParams,
      wasteRecords: [buildWasteRecord()],
      wasteBalanceRecords: [],
      registration: undefined,
      processingType: 'REPROCESSOR_INPUT',
      existingRecordsMap: new Map()
    })

    expect(result).toBeNull()
  })

  it('returns null for unknown processing type', async () => {
    const result = await computePeriodStatus({
      ...baseParams,
      wasteRecords: [buildWasteRecord()],
      wasteBalanceRecords: [],
      registration: accreditedRegistration,
      processingType: 'UNKNOWN_TYPE',
      existingRecordsMap: new Map()
    })

    expect(result).toBeNull()
  })

  it('passes null accreditation for registered-only registrations', async () => {
    const classifyForWasteBalance = vi.fn().mockReturnValue({
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 5
    })

    stubbedProcessingTypeTables.REPROCESSOR_INPUT.RECEIVED_LOADS_FOR_REPROCESSING.classifyForWasteBalance =
      classifyForWasteBalance

    const wasteRecords = [buildWasteRecord()]

    await computePeriodStatus({
      ...baseParams,
      wasteRecords,
      wasteBalanceRecords: wasteRecords,
      registration: registeredOnlyRegistration,
      processingType: 'REPROCESSOR_INPUT',
      existingRecordsMap: new Map()
    })

    expect(classifyForWasteBalance).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accreditation: null })
    )
  })

  it('handles unknown waste record type within a known processing type', async () => {
    const wasteRecords = [buildWasteRecord({ wasteRecordType: 'unknown' })]

    const result = await computePeriodStatus({
      ...baseParams,
      wasteRecords,
      wasteBalanceRecords: wasteRecords,
      registration: accreditedRegistration,
      processingType: 'REPROCESSOR_INPUT',
      existingRecordsMap: new Map()
    })

    expect(result).toEqual(
      expect.objectContaining({
        open: expect.objectContaining({
          added: expect.objectContaining({
            included: { count: 1, tonnageDelta: 0 }
          })
        })
      })
    )
  })
})
