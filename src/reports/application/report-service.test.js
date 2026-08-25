import { ObjectId } from 'mongodb'
import { calendarDate } from '#common/helpers/date-formatter.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildAwaitingAcceptancePrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  fetchOrGenerateReportForPeriod,
  createReportForPeriod,
  fetchReportBySubmissionNumber,
  createReportsService
} from './report-service.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { MAX_ISSUES_REPORTED } from './report-mandatory/assert-report-data-complete.js'

/**
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js'
 */

const SUMMARY_LOG_ID = 'sl-1'
const SUBMITTED_AT = new Date('2024-01-15T00:00:00.000Z')

/**
 * @param {Partial<Registration>} [overrides]
 * @returns {Registration}
 */
const buildRegistration = (overrides = {}) => {
  const hasAccreditationIdOverride = 'accreditationId' in overrides
  const accreditationId = hasAccreditationIdOverride
    ? overrides.accreditationId
    : new ObjectId().toString()
  const defaultAccreditation = accreditationId ? { status: 'approved' } : null
  const accreditation =
    'accreditation' in overrides
      ? overrides.accreditation
      : defaultAccreditation
  const { accreditation: _a, accreditationId: _b, ...rest } = overrides
  return /** @type {Registration} */ (
    /** @type {unknown} */ ({
      id: new ObjectId().toString(),
      accreditationId,
      accreditation,
      material: 'plastic',
      wasteProcessingType: 'reprocessor',
      site: {
        address: {
          line1: '1 Recycling Lane',
          town: 'Greenville',
          postcode: 'GR1 1AA'
        }
      },
      ...rest
    })
  )
}

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
 * Seeds the summary-log row states and the waste balance ledger so that the
 * report service resolves `entries` as the state at the latest submitted
 * summary log. An empty `entries` leaves the ledger without a submission.
 */
const seedState = async ({ organisationId, registration }, entries) => {
  const accreditationId = registration.accreditationId ?? null
  const ledgerId = {
    organisationId,
    registrationId: registration.id,
    accreditationId
  }
  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  const ledgerEvents = []
  if (entries.length > 0) {
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerId,
      entries,
      SUMMARY_LOG_ID
    )
    ledgerEvents.push(
      buildLedgerEvent({
        organisationId,
        registrationId: registration.id,
        accreditationId,
        number: 1,
        createdAt: SUBMITTED_AT,
        payload: { summaryLogId: SUMMARY_LOG_ID, creditTotal: 100 }
      })
    )
  }
  return {
    ledgerRepository: createInMemoryLedgerRepository(ledgerEvents)(),
    summaryLogRowStatesRepository
  }
}

const createPrnRepo = (initialData = []) =>
  createInMemoryPackagingRecyclingNotesRepository(initialData)(
    /** @type {any} */ (null)
  )

const defaultParams = () => {
  const organisationId = new ObjectId().toString()
  const registration = buildRegistration()
  return {
    organisationId,
    registrationId: registration.id,
    registration,
    year: 2024,
    cadence: /** @type {import('#reports/domain/cadence.js').Cadence} */ (
      'monthly'
    ),
    period: 1,
    submissionNumber: 1,
    overseasSitesRepository: createInMemoryOverseasSitesRepository()()
  }
}

describe('report-service', () => {
  describe('fetchOrGenerateReportForPeriod', () => {
    it('returns computed report when no stored report exists', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedState(params, [])

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        ledgerRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params
      })

      expect(report.recyclingActivity).toBeDefined()
      expect(report.wasteSent).toBeDefined()
      expect(report).not.toHaveProperty('id')
    })

    it('derives rows and source from the same submission when a new submission commits mid-read', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      const accreditationId = /** @type {string | null} */ (
        params.registration.accreditationId ?? null
      )
      const ledgerId = {
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        accreditationId
      }

      const summaryLogRowStatesRepository =
        createInMemorySummaryLogRowStatesRepository()()
      await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
        ledgerId,
        [buildReceivedEntry({ SUPPLIER_NAME: 'First Supplier' })],
        'sl-1'
      )
      await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
        ledgerId,
        [buildReceivedEntry({ SUPPLIER_NAME: 'Second Supplier' })],
        'sl-2'
      )

      const firstSubmission = /** @type {LedgerEvent} */ (
        buildLedgerEvent({
          ...ledgerId,
          number: 1,
          createdAt: SUBMITTED_AT,
          payload: { summaryLogId: 'sl-1', creditTotal: 100 }
        })
      )
      const secondSubmission = /** @type {LedgerEvent} */ (
        buildLedgerEvent({
          ...ledgerId,
          number: 2,
          createdAt: new Date('2024-02-15T00:00:00.000Z'),
          payload: { summaryLogId: 'sl-2', creditTotal: 150 }
        })
      )
      const beforeCommit = createInMemoryLedgerRepository([firstSubmission])()
      const afterCommit = createInMemoryLedgerRepository([
        firstSubmission,
        secondSubmission
      ])()
      let lookups = 0
      const ledgerRepository = /** @type {any} */ ({
        findLatestInLedgerByKind: (lookupLedgerId, kind) =>
          (lookups++ === 0
            ? beforeCommit
            : afterCommit
          ).findLatestInLedgerByKind(lookupLedgerId, kind)
      })

      const report =
        /** @type {import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail} */ (
          await fetchOrGenerateReportForPeriod({
            reportsRepository,
            ledgerRepository,
            summaryLogRowStatesRepository,
            packagingRecyclingNotesRepository,
            ...params
          })
        )

      expect(report.source).toEqual({
        summaryLogId: 'sl-1',
        lastUploadedAt: SUBMITTED_AT.toISOString()
      })
      expect(
        report.recyclingActivity.suppliers.map(
          ({ supplierName }) => supplierName
        )
      ).toEqual(['First Supplier'])
    })

    it('returns stored report when one exists', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedState(params, [])
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await reportsRepository.createReport({
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        year: 2024,
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
          summaryLogId: 'sl-1',
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
        ledgerRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params
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
      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedState(params, [])
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const baseReport = {
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        year: 2024,
        cadence: 'monthly',
        period: 1,
        startDate: calendarDate('2024-01-01'),
        endDate: calendarDate('2024-01-31'),
        dueDate: calendarDate('2024-02-15'),
        changedBy,
        material: 'plastic',
        wasteProcessingType: 'reprocessor',
        source: { summaryLogId: 'sl-1', lastUploadedAt: null },
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
        ledgerRepository,
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
      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        ledgerRepository,
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
      const gateEnabled = createInMemoryFeatureFlags({
        reportDataValidation: true
      })

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

      const generate = async (entries, featureFlags) => {
        const params = defaultParams()
        const { ledgerRepository, summaryLogRowStatesRepository } =
          await seedState(params, entries)
        return fetchOrGenerateReportForPeriod({
          reportsRepository: createInMemoryReportsRepository()(),
          ledgerRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: createPrnRepo(),
          ...params,
          featureFlags
        })
      }

      it('attaches incompleteSummaryLogRows on the generate branch when the flag is on and data is incomplete', async () => {
        const report = await generate([incompleteReceivedEntry()], gateEnabled)

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

        const report = await generate(entries, gateEnabled)

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
        const report = await generate(
          [incompleteReceivedEntry()],
          createInMemoryFeatureFlags()
        )

        expect(report).not.toHaveProperty('incompleteSummaryLogRows')
      })

      it('omits incompleteSummaryLogRows when the flag is on but data is complete', async () => {
        const report = await generate([completeReceivedEntry()], gateEnabled)

        expect(report).not.toHaveProperty('incompleteSummaryLogRows')
      })

      it('never attaches incompleteSummaryLogRows on the stored-report branch', async () => {
        const params = defaultParams()
        const { ledgerRepository, summaryLogRowStatesRepository } =
          await seedState(params, [incompleteReceivedEntry()])
        const reportsRepository = createInMemoryReportsRepository()()
        const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

        await reportsRepository.createReport({
          organisationId: params.organisationId,
          registrationId: params.registrationId,
          year: 2024,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          startDate: calendarDate('2024-01-01'),
          endDate: calendarDate('2024-01-31'),
          dueDate: calendarDate('2024-02-15'),
          changedBy,
          material: 'plastic',
          wasteProcessingType: 'reprocessor',
          source: { summaryLogId: 'sl-1', lastUploadedAt: null },
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
          ledgerRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: createPrnRepo(),
          ...params,
          featureFlags: gateEnabled
        })

        expect(report).not.toHaveProperty('incompleteSummaryLogRows')
      })
    })
  })

  describe('fetchReportBySubmissionNumber', () => {
    const baseReportFields = (params, changedBy) => ({
      organisationId: params.organisationId,
      registrationId: params.registrationId,
      year: 2024,
      cadence: 'monthly',
      period: 1,
      startDate: calendarDate('2024-01-01'),
      endDate: calendarDate('2024-01-31'),
      dueDate: calendarDate('2024-02-15'),
      changedBy,
      material: 'plastic',
      wasteProcessingType: 'reprocessor',
      source: { summaryLogId: 'sl-1', lastUploadedAt: null },
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
        params.organisationId,
        params.registrationId,
        2024,
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
      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        ledgerRepository,
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
      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await createReportForPeriod({
        reportsRepository,
        ledgerRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      await expect(
        createReportForPeriod({
          reportsRepository,
          ledgerRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository,
          ...params,
          changedBy
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws badRequest for period that has not yet ended', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      params.year = 2099
      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedState(params, [])
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await expect(
        createReportForPeriod({
          reportsRepository,
          ledgerRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository,
          ...params,
          changedBy
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })

    it('resolves glass material to glass recycling process', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      params.registration = buildRegistration({
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt']
      })
      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        ledgerRepository,
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
      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedState(params, [buildReceivedEntry()])
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        ledgerRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.siteAddress).toBe('1 Recycling Lane, Greenville, GR1 1AA')
    })

    describe('prn', () => {
      const IN_PERIOD = new Date('2024-01-15T12:00:00.000Z')
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const accreditationOf = ({
        organisationId,
        registrationId,
        registration
      }) => ({
        organisationId,
        registrationId,
        accreditationId: registration.accreditationId
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
        const params = defaultParams()
        params.registration = buildRegistration({ accreditationId: undefined })
        const { ledgerRepository, summaryLogRowStatesRepository } =
          await seedState(params, [buildReceivedEntry()])
        const prnRepo = createPrnRepo()

        const report = await createReportForPeriod({
          reportsRepository,
          ledgerRepository,
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
        const { ledgerRepository, summaryLogRowStatesRepository } =
          await seedState(params, [buildReceivedEntry()])
        const prnRepo = createPrnRepo()

        const report = await createReportForPeriod({
          reportsRepository,
          ledgerRepository,
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
        const { ledgerRepository, summaryLogRowStatesRepository } =
          await seedState(params, [buildReceivedEntry()])
        const prnRepo = createPrnRepo()

        await prnRepo.create(buildIssuedPrn(accreditationOf(params), 30))
        await prnRepo.create(buildIssuedPrn(accreditationOf(params), 20))

        const report = await createReportForPeriod({
          reportsRepository,
          ledgerRepository,
          summaryLogRowStatesRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn?.issuedTonnage).toBe(50)
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
      'org-1',
      'reg-1',
      '2026-07-01T00:00:00.000Z'
    )

    expect(reportsRepository.hasReportSubmittedSince).toHaveBeenCalledWith(
      'org-1',
      'reg-1',
      '2026-07-01T00:00:00.000Z'
    )
    expect(result).toBe(true)
  })

  it('delegates findPeriodicReports to the repository and returns its result', async () => {
    const periodicReports = [
      { organisationId: 'org-1', registrationId: 'reg-1' }
    ]
    const reportsRepository = /** @type {any} */ ({
      hasReportSubmittedSince: vi.fn(),
      findPeriodicReports: vi.fn().mockResolvedValue(periodicReports)
    })
    const service = createReportsService(reportsRepository)

    const params = { organisationId: 'org-1', registrationId: 'reg-1' }
    const result = await service.findPeriodicReports(params)

    expect(reportsRepository.findPeriodicReports).toHaveBeenCalledWith(params)
    expect(result).toBe(periodicReports)
  })
})
