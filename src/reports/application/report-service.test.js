import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { toYear } from '#common/helpers/dates/year.js'
import { ObjectId } from 'mongodb'
import { partialMock } from '#test/type-helpers.js'
import { calendarDate } from '#common/helpers/date-formatter.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createMockLogger } from '#test/mock-logger.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildAwaitingAcceptancePrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import {
  fetchOrGenerateReportForPeriod,
  createReportForPeriod,
  fetchReportBySubmissionNumber,
  createReportsService
} from './report-service.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { MAX_ISSUES_REPORTED } from './report-mandatory/assert-report-data-complete.js'
import { toSummaryLogFileId, toSummaryLogId } from '#domain/summary-logs/ids.js'
import { CADENCE } from '#reports/domain/cadence.js'

const ACCREDITATION_NUMBER = toAccreditationNumber('A24ER5000000001PL')

/**
 * @import { AccreditationNumber } from '#domain/organisations/numbers.js'
 * @import { ReprocessorAccreditation, ReprocessorRegistration } from '#organisation-read-model/domain/model.js'
 * @import { ReportRegistration } from '#reports/domain/operator-category.js'
 */

const SUMMARY_LOG_ID = 'sl-1'
const SUBMITTED_AT = '2024-01-15T00:00:00.000Z'

// Summary logs and PRNs are still stored under ids.
const LEDGER_IDS = {
  organisationId: new ObjectId().toString(),
  registrationId: new ObjectId().toString(),
  accreditationId: new ObjectId().toString()
}

/**
 * @param {AccreditationNumber} [accreditationNumber]
 * @returns {ReprocessorAccreditation}
 */
const readModelAccreditation = (
  accreditationNumber = ACCREDITATION_NUMBER
) => ({
  accreditationNumber,
  prnIssuance: { tonnageBand: 'over_10000' },
  status: { current: 'approved', timeline: [] }
})

/**
 * @param {Partial<ReprocessorRegistration>} [overrides]
 * @returns {ReprocessorRegistration}
 */
const readModelRegistration = (overrides = {}) =>
  partialMock({
    material: 'plastic',
    wasteProcessingType: 'reprocessor',
    site: {
      address: {
        line1: '1 Recycling Lane',
        town: 'Greenville',
        postcode: 'GR1 1AA'
      }
    },
    accreditations: { 2024: readModelAccreditation() },
    ...overrides
  })

const buildReceivedEntry = (overrides = {}) =>
  buildSummaryLogRowStateEntry({
    rowId: 'row-1',
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    data: {
      SUPPLIER_NAME: 'Supplier A',
      ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Reprocessor',
      TONNAGE_RECEIVED_FOR_RECYCLING: 100,
      DATE_RECEIVED_FOR_REPROCESSING: '2024-01-10',
      FINAL_DESTINATION_NAME: 'Dest A',
      FINAL_DESTINATION_FACILITY_TYPE: 'Reprocessor',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 50,
      DATE_LOAD_LEFT_SITE: '2024-01-12',
      ...overrides
    }
  })

/**
 * The stream a report reads: the report key's numbers and the registration's
 * current accreditation.
 */
const reportLedger = ({ key, reportRegistration: { accreditation } }) => ({
  ...LEDGER_IDS,
  accreditationId: accreditation === null ? null : LEDGER_IDS.accreditationId,
  ...key,
  accreditationNumber: accreditation?.accreditationNumber ?? null
})

const emptyStores = () => ({
  summaryLogsRepository:
    createInMemorySummaryLogsRepository()(createMockLogger()),
  summaryLogRowStatesRepository: createInMemorySummaryLogRowStatesRepository()()
})

/**
 * Submits a summary log for `year`: its row states, and the submitted summary
 * log the report service resolves as the head.
 */
const submitLog = async (
  { summaryLogsRepository, summaryLogRowStatesRepository },
  ledgerId,
  { fileId, year, submittedAt, entries }
) => {
  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    ledgerId,
    entries,
    toSummaryLogFileId(fileId)
  )
  await summaryLogsRepository.insert(
    toSummaryLogId(`log-${fileId}`),
    summaryLogFactory.submitted({
      ...ledgerId,
      year,
      file: { id: toSummaryLogFileId(fileId) },
      submittedAt
    })
  )
}

/**
 * Seeds `entries` as the state at the latest submitted summary log for the
 * report's year. An empty `entries` leaves the year without a submission.
 */
const seedState = async (params, entries) => {
  const stores = emptyStores()
  if (entries.length > 0) {
    await submitLog(stores, reportLedger(params), {
      fileId: SUMMARY_LOG_ID,
      year: params.year,
      submittedAt: SUBMITTED_AT,
      entries
    })
  }
  return stores
}

const createPrnRepo = (initialData = []) =>
  createInMemoryPackagingRecyclingNotesRepository(initialData)(
    /** @type {any} */ (null)
  )

const defaultParams = () => {
  const registration = readModelRegistration()
  const key = {
    organisationNumber: toOrganisationNumber('500123'),
    registrationNumber: toRegistrationNumber('R25SR500010912PL')
  }
  return {
    key,
    numbers: key,
    /** @type {ReportRegistration} */
    reportRegistration: {
      registration,
      accreditation: registration.accreditations[2024]
    },
    year: toYear(2024),
    cadenceAccreditation: {
      cadence: CADENCE.monthly,
      accreditationNumber: ACCREDITATION_NUMBER
    },
    period: 1,
    submissionNumber: 1,
    requiredPeriods: generateAllPeriodsForYear('monthly', toYear(2024))
  }
}

describe('report-service', () => {
  describe('fetchOrGenerateReportForPeriod', () => {
    it('returns computed report when no stored report exists', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [])

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params
      })

      expect(report.recyclingActivity).toBeDefined()
      expect(report.wasteSent).toBeDefined()
      expect(report).not.toHaveProperty('id')
    })

    it("reads the summary log of the report's own year after a later year's log is submitted", async () => {
      const accreditation = readModelAccreditation()
      const registration = readModelRegistration({
        accreditations: { 2025: accreditation, 2026: accreditation }
      })
      const params = {
        ...defaultParams(),
        reportRegistration: { registration, accreditation },
        year: toYear(2025),
        period: 12,
        requiredPeriods: generateAllPeriodsForYear('monthly', toYear(2025))
      }
      const ledgerId = reportLedger(params)
      const stores = emptyStores()

      await submitLog(stores, ledgerId, {
        fileId: 'sl-2025',
        year: toYear(2025),
        submittedAt: '2026-01-05T00:00:00.000Z',
        entries: [
          buildReceivedEntry({
            SUPPLIER_NAME: 'December Supplier',
            DATE_RECEIVED_FOR_REPROCESSING: '2025-12-20'
          })
        ]
      })
      await submitLog(stores, ledgerId, {
        fileId: 'sl-2026',
        year: toYear(2026),
        submittedAt: '2026-02-05T00:00:00.000Z',
        entries: [
          buildReceivedEntry({
            SUPPLIER_NAME: 'January Supplier',
            DATE_RECEIVED_FOR_REPROCESSING: '2026-01-20'
          })
        ]
      })

      const report =
        /** @type {import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail} */ (
          await fetchOrGenerateReportForPeriod({
            reportsRepository: createInMemoryReportsRepository()(),
            packagingRecyclingNotesRepository: createPrnRepo(),
            ...stores,
            ...params
          })
        )

      expect(report.source).toEqual({
        summaryLogId: 'sl-2025',
        lastUploadedAt: '2026-01-05T00:00:00.000Z'
      })
      expect(
        report.recyclingActivity.suppliers.map(
          ({ supplierName }) => supplierName
        )
      ).toEqual(['December Supplier'])
    })

    it('derives rows and source from the same submission when a new submission commits mid-read', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      const ledgerId = reportLedger(params)
      const first = {
        fileId: 'sl-1',
        year: params.year,
        submittedAt: SUBMITTED_AT,
        entries: [buildReceivedEntry({ SUPPLIER_NAME: 'First Supplier' })]
      }
      const second = {
        fileId: 'sl-2',
        year: params.year,
        submittedAt: '2024-02-15T00:00:00.000Z',
        entries: [buildReceivedEntry({ SUPPLIER_NAME: 'Second Supplier' })]
      }

      const beforeCommit = emptyStores()
      await submitLog(beforeCommit, ledgerId, first)
      const afterCommit = emptyStores()
      await submitLog(afterCommit, ledgerId, first)
      await submitLog(afterCommit, ledgerId, second)

      let lookups = 0
      const summaryLogsRepository = /** @type {any} */ ({
        findLatestSubmitted: (key) =>
          (lookups++ === 0
            ? beforeCommit
            : afterCommit
          ).summaryLogsRepository.findLatestSubmitted(key)
      })
      const { summaryLogRowStatesRepository } = afterCommit

      const report =
        /** @type {import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail} */ (
          await fetchOrGenerateReportForPeriod({
            reportsRepository,
            summaryLogsRepository,
            summaryLogRowStatesRepository,
            packagingRecyclingNotesRepository,
            ...params
          })
        )

      expect(report.source).toEqual({
        summaryLogId: 'sl-1',
        lastUploadedAt: SUBMITTED_AT
      })
      expect(
        report.recyclingActivity.suppliers.map(
          ({ supplierName }) => supplierName
        )
      ).toEqual(['First Supplier'])
    })

    it('throws 404 period_not_required when no report is stored and the period is not owed', async () => {
      const params = defaultParams()
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [])

      await expect(
        fetchOrGenerateReportForPeriod({
          reportsRepository: createInMemoryReportsRepository()(),
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: createPrnRepo(),
          ...params,
          requiredPeriods: []
        })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 },
        code: 'period_not_required'
      })
    })

    it('returns stored report when one exists, owed or not', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [])
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await reportsRepository.createReport({
        ...params.key,
        accreditationNumber: ACCREDITATION_NUMBER,
        year: toYear(2024),
        cadence: 'monthly',
        period: 1,
        submissionNumber: 1,
        startDate: calendarDate('2024-01-01'),
        endDate: calendarDate('2024-01-31'),
        dueDate: calendarDate('2024-02-15'),
        changedBy,
        material: 'plastic',
        wasteProcessingType: 'reprocessor',
        source: {
          summaryLogId: toSummaryLogFileId('sl-1'),
          lastUploadedAt: '2026-04-01T21:22:28.351Z'
        },
        prn: null,
        recyclingActivity: {
          suppliers: [],
          totalTonnageReceived: 0,
          tonnageRecycled: null,
          tonnageNotRecycled: null
        },
        wasteSent: {
          tonnageSentToReprocessor: 0,
          tonnageSentToExporter: 0,
          tonnageSentToAnotherSite: 0,
          finalDestinations: []
        }
      })

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        requiredPeriods: []
      })

      const storedReport =
        /** @type {import('#reports/repository/port.js').Report} */ (report)
      expect(storedReport.id).toBeDefined()
      expect(storedReport.status.currentStatus).toBe(REPORT_STATUS.IN_PROGRESS)
    })

    it('returns stored report when submissionNumber matches a previous submission', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [])
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const baseReport = {
        ...params.key,
        accreditationNumber: ACCREDITATION_NUMBER,
        year: toYear(2024),
        cadence: CADENCE.monthly,
        period: 1,
        startDate: calendarDate('2024-01-01'),
        endDate: calendarDate('2024-01-31'),
        dueDate: calendarDate('2024-02-15'),
        changedBy,
        material: 'plastic',
        wasteProcessingType: 'reprocessor',
        source: {
          summaryLogId: toSummaryLogFileId('sl-1'),
          lastUploadedAt: null
        },
        prn: null,
        recyclingActivity: {
          suppliers: [],
          totalTonnageReceived: 0,
          tonnageRecycled: null,
          tonnageNotRecycled: null
        },
        wasteSent: {
          tonnageSentToReprocessor: 0,
          tonnageSentToExporter: 0,
          tonnageSentToAnotherSite: 0,
          finalDestinations: []
        }
      }

      const report1 = await reportsRepository.createReport({
        ...baseReport,
        submissionNumber: 1
      })
      await reportsRepository.updateReportStatus({
        reportId: report1.id,
        version: 1,
        status: 'submitted',
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy,
        submissionDeclaredBy: 'Test User'
      })
      await reportsRepository.createReport({
        ...baseReport,
        submissionNumber: 2
      })

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        submissionNumber: 1
      })

      const storedReport =
        /** @type {import('#reports/repository/port.js').Report} */ (report)
      expect(storedReport.id).toBe(report1.id)
    })

    it('returns computed report with aggregated waste data', async () => {
      const params = defaultParams()
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params
      })

      expect(report.recyclingActivity?.suppliers).toHaveLength(1)
      expect(report.recyclingActivity?.suppliers[0]?.supplierName).toBe(
        'Supplier A'
      )
    })

    describe('incompleteSummaryLogRows (PAE-1420)', () => {
      // A received row whose positive tonnage triggers the supplier rule but
      // carries none of the six mandatory supplier fields: six missing fields.
      const incompleteReceivedEntry = () =>
        buildSummaryLogRowStateEntry({
          rowId: 'row-1',
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          data: { TONNAGE_RECEIVED_FOR_RECYCLING: 5 }
        })

      const completeReceivedEntry = () =>
        buildSummaryLogRowStateEntry({
          rowId: 'row-1',
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          data: {
            TONNAGE_RECEIVED_FOR_RECYCLING: 5,
            SUPPLIER_NAME: 'Acme Waste Ltd',
            SUPPLIER_ADDRESS: '1 Depot Road',
            SUPPLIER_POSTCODE: 'AB1 2CD',
            SUPPLIER_EMAIL: 'ops@acme.example',
            SUPPLIER_PHONE_NUMBER: '01234 567890',
            ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baling'
          }
        })

      const generate = async (entries, reportDataValidationEnabled) => {
        const params = defaultParams()
        const { summaryLogsRepository, summaryLogRowStatesRepository } =
          await seedState(params, entries)
        return fetchOrGenerateReportForPeriod({
          reportsRepository: createInMemoryReportsRepository()(),
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: createPrnRepo(),
          ...params,
          reportDataValidationEnabled
        })
      }

      it('attaches incompleteSummaryLogRows on the generate branch when the flag is on and data is incomplete', async () => {
        const report = await generate([incompleteReceivedEntry()], true)

        const { incompleteSummaryLogRows } = report
        expect(incompleteSummaryLogRows?.total).toBe(6)
        expect(incompleteSummaryLogRows?.issues).toHaveLength(6)
        expect(incompleteSummaryLogRows?.issues).toContainEqual(
          expect.objectContaining({ rowId: 'row-1', field: 'SUPPLIER_NAME' })
        )
      })

      it('caps issues at MAX_ISSUES_REPORTED while total stays truthful', async () => {
        // Each incomplete received row contributes six missing supplier fields,
        // so enough rows breach the display cap. total stays truthful; issues
        // is capped.
        const FIELDS_PER_ROW = 6
        const rowCount = Math.ceil((MAX_ISSUES_REPORTED + 1) / FIELDS_PER_ROW)
        const entries = Array.from({ length: rowCount }, (_, index) =>
          buildSummaryLogRowStateEntry({
            rowId: `row-${index + 1}`,
            wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
            data: { TONNAGE_RECEIVED_FOR_RECYCLING: 5 }
          })
        )

        const report = await generate(entries, true)

        const { incompleteSummaryLogRows } = report
        expect(incompleteSummaryLogRows?.total).toBe(rowCount * FIELDS_PER_ROW)
        expect(incompleteSummaryLogRows?.total).toBeGreaterThan(
          MAX_ISSUES_REPORTED
        )
        expect(incompleteSummaryLogRows?.issues).toHaveLength(
          MAX_ISSUES_REPORTED
        )
      })

      it('omits incompleteSummaryLogRows when the flag is off despite incomplete data', async () => {
        const report = await generate([incompleteReceivedEntry()], false)

        expect(report).not.toHaveProperty('incompleteSummaryLogRows')
      })

      it('omits incompleteSummaryLogRows when the flag is on but data is complete', async () => {
        const report = await generate([completeReceivedEntry()], true)

        expect(report).not.toHaveProperty('incompleteSummaryLogRows')
      })

      it('never attaches incompleteSummaryLogRows on the stored-report branch', async () => {
        const params = defaultParams()
        const { summaryLogsRepository, summaryLogRowStatesRepository } =
          await seedState(params, [incompleteReceivedEntry()])
        const reportsRepository = createInMemoryReportsRepository()()
        const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

        await reportsRepository.createReport({
          ...params.key,
          accreditationNumber: ACCREDITATION_NUMBER,
          year: toYear(2024),
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          startDate: calendarDate('2024-01-01'),
          endDate: calendarDate('2024-01-31'),
          dueDate: calendarDate('2024-02-15'),
          changedBy,
          material: 'plastic',
          wasteProcessingType: 'reprocessor',
          source: {
            summaryLogId: toSummaryLogFileId('sl-1'),
            lastUploadedAt: null
          },
          prn: null,
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 0,
            tonnageRecycled: null,
            tonnageNotRecycled: null
          },
          wasteSent: {
            tonnageSentToReprocessor: 0,
            tonnageSentToExporter: 0,
            tonnageSentToAnotherSite: 0,
            finalDestinations: []
          }
        })

        const report = await fetchOrGenerateReportForPeriod({
          reportsRepository,
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: createPrnRepo(),
          ...params,
          reportDataValidationEnabled: true
        })

        expect(report).not.toHaveProperty('incompleteSummaryLogRows')
      })
    })
  })

  describe('fetchReportBySubmissionNumber', () => {
    const baseReportFields = (params, changedBy) => ({
      ...params.key,
      accreditationNumber: ACCREDITATION_NUMBER,
      year: toYear(2024),
      cadence: CADENCE.monthly,
      period: 1,
      startDate: calendarDate('2024-01-01'),
      endDate: calendarDate('2024-01-31'),
      dueDate: calendarDate('2024-02-15'),
      changedBy,
      material: 'plastic',
      wasteProcessingType: 'reprocessor',
      source: {
        summaryLogId: toSummaryLogFileId('sl-1'),
        lastUploadedAt: null
      },
      prn: null,
      recyclingActivity: {
        suppliers: [],
        totalTonnageReceived: 0,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      },
      wasteSent: {
        tonnageSentToReprocessor: 0,
        tonnageSentToExporter: 0,
        tonnageSentToAnotherSite: 0,
        finalDestinations: []
      }
    })

    it('returns null when submissionNumber does not match current or any previous submission', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await reportsRepository.createReport({
        ...baseReportFields(params, changedBy),
        submissionNumber: 1
      })

      const result = await fetchReportBySubmissionNumber(
        reportsRepository,
        params.key,
        toYear(2024),
        'monthly',
        1,
        99
      )

      expect(result).toBeNull()
    })
  })

  describe('createReportForPeriod', () => {
    it('creates a report and returns the full object', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.id).toBeDefined()
      expect(report.status.currentStatus).toBe(REPORT_STATUS.IN_PROGRESS)
      expect(report.material).toBe('plastic')
      expect(report.recyclingActivity).toBeDefined()
      expect(report.wasteSent).toBeDefined()
    })

    it('throws conflict when report already exists for period', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await createReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      await expect(
        createReportForPeriod({
          reportsRepository,
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository,
          ...params,
          changedBy
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws 404 period_not_required for a period not owed, storing nothing', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])

      await expect(
        createReportForPeriod({
          reportsRepository,
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: createPrnRepo(),
          ...params,
          requiredPeriods: [],
          changedBy: { id: 'user-1', name: 'Alice', position: 'Officer' }
        })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 },
        code: 'period_not_required'
      })
      expect(
        await reportsRepository.findPeriodicReports(params.key)
      ).toStrictEqual([])
    })

    it('throws badRequest for period that has not yet ended', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      params.year = toYear(2099)
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [])
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await expect(
        createReportForPeriod({
          reportsRepository,
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository,
          ...params,
          changedBy
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })

    it('records the material the registration is read as, a glass recycling process for glass', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      params.reportRegistration = {
        ...params.reportRegistration,
        registration: readModelRegistration({ material: 'glass_re_melt' })
      }
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.material).toBe('glass_re_melt')
    })

    it('formats site address into single-line string', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.siteAddress).toBe('1 Recycling Lane, Greenville, GR1 1AA')
    })

    it('records the site address as submitted when its town could not be found', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      params.reportRegistration = {
        ...params.reportRegistration,
        registration: readModelRegistration({
          site: { address: { fullAddress: '1 Recycling Lane GR1 1AA' } }
        })
      }
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.siteAddress).toBe('1 Recycling Lane GR1 1AA')
    })

    it('records the site address as submitted when its parts have no town', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      params.reportRegistration = {
        ...params.reportRegistration,
        registration: readModelRegistration({
          site: {
            address: {
              line1: '1 Recycling Lane',
              postcode: 'GR1 1AA',
              fullAddress:
                '1 Recycling Lane, Unit 4, Greenville, Shire, GR1 1AA'
            }
          }
        })
      }
      const { summaryLogsRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        summaryLogsRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.siteAddress).toBe(
        '1 Recycling Lane, Unit 4, Greenville, Shire, GR1 1AA'
      )
    })

    describe('prn', () => {
      const IN_PERIOD = new Date('2024-01-15T12:00:00.000Z')
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      /** @param {ReturnType<typeof defaultParams>} params */
      const accreditationOf = ({ numbers, cadenceAccreditation }) => ({
        ...LEDGER_IDS,
        ...numbers,
        accreditationNumber: cadenceAccreditation.accreditationNumber
      })

      const buildIssuedPrn = (accreditation, tonnage) =>
        buildAwaitingAcceptancePrn({
          ...underAccreditation(accreditation),
          tonnage,
          status: {
            currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
            currentStatusAt: IN_PERIOD,
            issued: { at: IN_PERIOD, by: { id: 'test', name: 'test' } },
            history: [
              {
                status: PRN_STATUS.AWAITING_ACCEPTANCE,
                at: IN_PERIOD,
                by: { id: 'test', name: 'test' }
              }
            ]
          }
        })

      it('is null for non-accredited operator', async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const params = {
          ...defaultParams(),
          reportRegistration: {
            registration: readModelRegistration({ accreditations: {} }),
            accreditation: null
          },
          cadenceAccreditation: {
            cadence: CADENCE.quarterly,
            accreditationNumber: null
          },
          requiredPeriods: generateAllPeriodsForYear('quarterly', toYear(2024))
        }
        const { summaryLogsRepository, summaryLogRowStatesRepository } =
          await seedState(params, [buildReceivedEntry()])
        const prnRepo = createPrnRepo()

        const report = await createReportForPeriod({
          reportsRepository,
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn).toBeNull()
      })

      it('persists prn with issuedTonnage 0 when accredited and no PRNs exist', async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const params = defaultParams()
        const { summaryLogsRepository, summaryLogRowStatesRepository } =
          await seedState(params, [buildReceivedEntry()])
        const prnRepo = createPrnRepo()

        const report = await createReportForPeriod({
          reportsRepository,
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn?.issuedTonnage).toBe(0)
      })

      it('persists prn with summed issuedTonnage from PRNs in period', async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const params = defaultParams()
        const { summaryLogsRepository, summaryLogRowStatesRepository } =
          await seedState(params, [buildReceivedEntry()])
        const prnRepo = createPrnRepo()

        await prnRepo.create(buildIssuedPrn(accreditationOf(params), 30))
        await prnRepo.create(buildIssuedPrn(accreditationOf(params), 20))

        const report = await createReportForPeriod({
          reportsRepository,
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn?.issuedTonnage).toBe(50)
      })

      it("counts the PRNs of the report's accreditation, not the registration's current one", async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const currentAccreditationNumber =
          toAccreditationNumber('A25ER5000000002PL')
        const reportAccreditation = readModelAccreditation()
        const params = {
          ...defaultParams(),
          reportRegistration: {
            registration: readModelRegistration({
              accreditations: {
                2024: reportAccreditation,
                2025: readModelAccreditation(currentAccreditationNumber)
              }
            }),
            accreditation: reportAccreditation
          }
        }
        const { summaryLogsRepository, summaryLogRowStatesRepository } =
          await seedState(params, [buildReceivedEntry()])
        const prnRepo = createPrnRepo()

        await prnRepo.create(buildIssuedPrn(accreditationOf(params), 30))
        await prnRepo.create(
          buildIssuedPrn(
            {
              ...accreditationOf(params),
              accreditationNumber: currentAccreditationNumber
            },
            40
          )
        )

        const report = await createReportForPeriod({
          reportsRepository,
          summaryLogsRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn?.issuedTonnage).toBe(30)
      })
    })
  })
})

describe('createReportsService', () => {
  it('delegates hasReportSubmittedSince to the repository and returns its result', async () => {
    const reportsRepository = /** @type {any} */ ({
      hasReportSubmittedSince: vi.fn().mockResolvedValue(true),
      findPeriodicReports: vi.fn()
    })
    const service = createReportsService(reportsRepository)

    const result = await service.hasReportSubmittedSince(
      toOrganisationNumber('500123'),
      toRegistrationNumber('R25SR500010912PL'),
      '2026-07-01T00:00:00.000Z'
    )

    expect(reportsRepository.hasReportSubmittedSince).toHaveBeenCalledWith(
      '500123',
      'R25SR500010912PL',
      '2026-07-01T00:00:00.000Z'
    )
    expect(result).toBe(true)
  })

  it('delegates findPeriodicReports to the repository and returns its result', async () => {
    const periodicReports = [
      { organisationNumber: '500123', registrationNumber: 'R25SR500010912PL' }
    ]
    const reportsRepository = /** @type {any} */ ({
      hasReportSubmittedSince: vi.fn(),
      findPeriodicReports: vi.fn().mockResolvedValue(periodicReports)
    })
    const service = createReportsService(reportsRepository)

    const params = {
      organisationNumber: toOrganisationNumber('500123'),
      registrationNumber: toRegistrationNumber('R25SR500010912PL')
    }
    const result = await service.findPeriodicReports(params)

    expect(reportsRepository.findPeriodicReports).toHaveBeenCalledWith(params)
    expect(result).toBe(periodicReports)
  })
})
