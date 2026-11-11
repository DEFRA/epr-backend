import { toYear } from '#common/helpers/dates/year.js'
import { vi } from 'vitest'
import { ObjectId } from 'mongodb'

import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  reportKeyOf
} from '#reports/repository/contract/test-data.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createReportsService } from '#reports/application/report-service.js'
import { createOnSummaryLogUploaded } from '#reports/application/summary-log-events.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { emptyLoadsByReportingPeriod } from '#domain/summary-logs/loads-by-period-status-schema.js'
import {
  REPROCESSOR_RECEIVED_HEADERS,
  createReprocessorReceivedRowValues,
  createStandardMeta
} from '#routes/v1/organisations/registrations/summary-logs/integration-test-helpers.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { summaryLogRowStatesForRegistration } from '#waste-records/application/read-summary-log-row-states.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { toSummaryLogId } from '#domain/summary-logs/ids.js'

const { buildReadOrganisation } = createOrganisationBuilders()

const mockRecordDecemberWasteRows = vi.fn()

vi.mock(
  import('#application/summary-logs/metrics.js'),
  async (importOriginal) => {
    const original = await importOriginal()
    return {
      ...original,
      summaryLogMetrics: {
        ...original.summaryLogMetrics,
        recordDecemberWasteRows: (...args) =>
          mockRecordDecemberWasteRows(...args)
      }
    }
  }
)

const VALID_FROM = '2025-01-01'
const VALID_TO = '2025-12-31'

const META = createStandardMeta('REPROCESSOR_INPUT')

const RECEIVED_DATA = {
  RECEIVED_LOADS_FOR_REPROCESSING: {
    location: { sheet: 'Received', row: 7, column: 'A' },
    headers: REPROCESSOR_RECEIVED_HEADERS,
    rows: [
      {
        rowNumber: 8,
        values: createReprocessorReceivedRowValues({ rowId: 1001 })
      },
      {
        rowNumber: 9,
        values: createReprocessorReceivedRowValues({ rowId: 1002 })
      }
    ]
  }
}

const SUBMIT_USER = {
  id: 'user-123',
  email: 'operator@example.com',
  scope: ['some-scope'],
  role: null
}

const buildTestOrg = (organisationId, registrationId) => {
  const accreditationId = 'acc-123'
  const testOrg = buildReadOrganisation({
    registrations: [
      partialMock({
        id: registrationId,
        registrationNumber: toRegistrationNumber('REG-123'),
        status: 'approved',
        material: 'paper',
        wasteProcessingType: 'reprocessor',
        reprocessingType: 'input',
        submittedToRegulator: 'ea',
        validFrom: VALID_FROM,
        accreditationId
      })
    ],
    accreditations: [
      partialMock({
        id: accreditationId,
        accreditationNumber: toAccreditationNumber('ACC-123'),
        material: 'paper',
        wasteProcessingType: 'reprocessor',
        reprocessingType: 'input',
        submittedToRegulator: 'ea',
        validFrom: VALID_FROM,
        validTo: VALID_TO
      })
    ]
  })
  testOrg.id = organisationId
  return { ...testOrg, status: ORGANISATION_STATUS.ACTIVE }
}

/**
 * Wires the real submit worker against real in-memory repositories, seeds a
 * SUBMITTING summary log, and returns everything needed to invoke and assert.
 *
 * @param {object} options
 * @param {import('#reports/repository/port.js').ReportsRepository} options.reportsRepository
 * @param {string} [options.createdAt] - immutable creation timestamp of the log
 * @param {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog['data']} [options.data] - summary log sheet data, defaults to RECEIVED_DATA
 * @param {import('#domain/summary-logs/loads-by-period-status-schema.js').LoadsByReportingPeriod} [options.loadsByReportingPeriod] - persisted period-status artefact
 * @param {string | null} [options.accreditationId] - the accreditation the log submits to, `null` for registered-only
 * @param {import('#domain/organisations/numbers.js').AccreditationNumber | null} [options.accreditationNumber] - that accreditation's number
 * @param {boolean} [options.accreditationStoredByNumberOnly] - store the accreditation with its number and no database id, as one from 2027 is
 */
const setupSubmit = async ({
  reportsRepository,
  createdAt,
  data,
  loadsByReportingPeriod,
  accreditationId = 'acc-123',
  accreditationNumber = toAccreditationNumber('ACC-123'),
  accreditationStoredByNumberOnly = false
}) => {
  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()
  const logger = createMockLogger()

  const summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
  const organisation = buildTestOrg(organisationId, registrationId)
  if (accreditationStoredByNumberOnly) {
    delete (
      /** @type {Record<string, unknown>} */ (organisation.accreditations[0]).id
    )
    delete (
      /** @type {Record<string, unknown>} */ (organisation.registrations[0])
        .accreditationId
    )
  }
  const organisationAdministrationRepository =
    createInMemoryOrganisationsRepository([organisation])()
  const reportKey = reportKeyOf(organisation, organisation.registrations[0])

  const summaryLog = summaryLogFactory.submitting({
    organisationId,
    registrationId,
    ...reportKey,
    accreditationId,
    accreditationNumber,
    meta: { PROCESSING_TYPE: 'REPROCESSOR_INPUT' },
    ...(createdAt && { createdAt })
  })
  const summaryLogId = toSummaryLogId(`submit-${organisationId}`)
  await summaryLogsRepository.insert(summaryLogId, summaryLog)

  // Validation writes this artefact via update, not insert, so seed it the same way.
  if (loadsByReportingPeriod) {
    await summaryLogsRepository.update(summaryLogId, 1, {
      loadsByReportingPeriod
    })
    await waitForVersion(summaryLogsRepository, summaryLogId, 2)
  }

  const summaryLogExtractor = createInMemorySummaryLogExtractor({
    [summaryLog.file.id]: { meta: META, data: data ?? RECEIVED_DATA }
  })

  const ledgerRepository = createInMemoryLedgerRepository()()

  const deps = {
    logger,
    summaryLogsRepository,
    organisationAdministrationRepository,
    summaryLogRowStatesRepository:
      createInMemorySummaryLogRowStatesRepository()(),
    ledgerRepository,
    wasteBalanceService: createWasteBalanceService(ledgerRepository),
    summaryLogExtractor,
    overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
    reportsService: createReportsService(reportsRepository),
    user: SUBMIT_USER,
    onSummaryLogUploaded: vi.fn().mockResolvedValue(undefined)
  }

  return {
    deps,
    summaryLogId,
    summaryLog,
    organisation,
    reportKey,
    summaryLogsRepository
  }
}

describe('submitSummaryLog staleness guard (period closure)', () => {
  it('rejects when a report was submitted after the summary log was created', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    const { deps, summaryLogId, reportKey, summaryLogsRepository } =
      await setupSubmit({
        reportsRepository,
        createdAt: '2024-01-01T00:00:00.000Z'
      })

    // A periodic report closes for this registration after the log was created:
    // its SUBMITTED status.history entry is stamped "now", well after 2024.
    await createAndSubmitReport(reportsRepository, reportKey)

    await expect(submitSummaryLog(summaryLogId, deps)).rejects.toBeInstanceOf(
      PermanentError
    )

    // The guard throws before any write, so the log is untouched at version 1.
    const { summaryLog, version } = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      1
    )
    expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTING)
    expect(version).toBe(1)
  })

  it('proceeds and writes records when no report has been submitted since creation', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    const { deps, summaryLogId, reportKey, summaryLogsRepository } =
      await setupSubmit({ reportsRepository })

    // An open (never-submitted) report exists for the registration: the guard
    // reacts only to SUBMITTED closures, so submission must still proceed.
    await reportsRepository.createReport(buildCreateReportParams(reportKey))

    await submitSummaryLog(summaryLogId, deps)

    const rowStates = await summaryLogRowStatesForRegistration({
      ...reportKey,
      accreditationNumber: toAccreditationNumber('ACC-123'),
      ledgerRepository: deps.ledgerRepository,
      summaryLogRowStatesRepository: deps.summaryLogRowStatesRepository
    })
    expect(rowStates.map((state) => state.rowId).sort()).toEqual([
      '1001',
      '1002'
    ])

    const { summaryLog } = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      2
    )
    expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
  })

  it('ignores a report last submitted before the summary log was created', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    // The log is created far in the future, after any real submission, so the
    // seeded closure predates it and the guard must not fire.
    const { deps, summaryLogId, reportKey, summaryLogsRepository } =
      await setupSubmit({
        reportsRepository,
        createdAt: '2099-01-01T00:00:00.000Z'
      })

    await createAndSubmitReport(reportsRepository, reportKey)

    await submitSummaryLog(summaryLogId, deps)

    const { summaryLog } = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      2
    )
    expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
  })
})

describe('submitSummaryLog resubmission flag source', () => {
  const january = { year: toYear(2025), cadence: 'monthly', period: 1 }
  const february = { year: toYear(2025), cadence: 'monthly', period: 2 }

  /**
   * Submits a log over submitted January and February reports, through the
   * real summary-log-uploaded handler, and reports which ended up flagged.
   *
   * @param {import('#domain/summary-logs/loads-by-period-status-schema.js').LoadsByReportingPeriod} loadsByReportingPeriod
   */
  const submitOverJanuaryAndFebruaryReports = async (
    loadsByReportingPeriod
  ) => {
    const reportsRepository = createInMemoryReportsRepository()()
    const { deps, summaryLogId, reportKey } = await setupSubmit({
      reportsRepository,
      // After any real submission, so the staleness guard does not fire.
      createdAt: '2099-01-01T00:00:00.000Z',
      loadsByReportingPeriod
    })

    const submitReportFor = ({ year, period }) =>
      createAndSubmitReport(reportsRepository, {
        ...reportKey,
        year,
        period
      })
    const januaryReportId = await submitReportFor(january)
    const februaryReportId = await submitReportFor(february)

    await submitSummaryLog(summaryLogId, {
      ...deps,
      onSummaryLogUploaded: createOnSummaryLogUploaded({
        reportsRepository,
        systemLogsRepository: createSystemLogsRepository()(deps.logger)
      })
    })

    const isFlagged = async (/** @type {string} */ reportId) =>
      (await reportsRepository.findReportById(reportId))
        .resubmissionRequired !== undefined

    return {
      january: await isFlagged(januaryReportId),
      february: await isFlagged(februaryReportId)
    }
  }

  it('flags only the report for the figure-changed period, not every touched closed period', async () => {
    const flagged = await submitOverJanuaryAndFebruaryReports({
      ...emptyLoadsByReportingPeriod(),
      closedPeriods: [january, february],
      periodsRequiringResubmission: [january]
    })

    expect(flagged).toEqual({ january: true, february: false })
  })

  it('flags every touched closed period for a log validated before periodsRequiringResubmission existed', async () => {
    const { openPeriodLoads, closedPeriodLoads } = emptyLoadsByReportingPeriod()

    const flagged = await submitOverJanuaryAndFebruaryReports({
      openPeriodLoads,
      closedPeriodLoads,
      closedPeriods: [january, february]
    })

    expect(flagged).toEqual({ january: true, february: true })
  })
})

describe('submitSummaryLog stale flagging', () => {
  it('leaves alone an active report already built from the summary log being submitted', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    const { deps, summaryLogId, summaryLog, reportKey } = await setupSubmit({
      reportsRepository,
      createdAt: '2099-01-01T00:00:00.000Z'
    })
    const { id: reportId } = await reportsRepository.createReport(
      buildCreateReportParams({
        ...reportKey,
        source: {
          summaryLogId: summaryLog.file.id,
          lastUploadedAt: '2099-01-01T00:00:00.000Z'
        }
      })
    )

    await submitSummaryLog(summaryLogId, {
      ...deps,
      onSummaryLogUploaded: createOnSummaryLogUploaded({
        reportsRepository,
        systemLogsRepository: createSystemLogsRepository()(deps.logger)
      })
    })

    const report = await reportsRepository.findReportById(reportId)
    expect(report.stale).toBeUndefined()
  })
})

describe('submitSummaryLog December waste metric', () => {
  it('counts rows that fall in the accreditation-year December', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    const decemberData = {
      RECEIVED_LOADS_FOR_REPROCESSING: {
        location: { sheet: 'Received', row: 7, column: 'A' },
        headers: REPROCESSOR_RECEIVED_HEADERS,
        rows: [
          {
            rowNumber: 8,
            values: createReprocessorReceivedRowValues({
              rowId: 1001,
              dateReceived: '2025-12-15T00:00:00.000Z'
            })
          },
          {
            rowNumber: 9,
            values: createReprocessorReceivedRowValues({
              rowId: 1002,
              dateReceived: '2025-06-15T00:00:00.000Z'
            })
          }
        ]
      }
    }
    const { deps, summaryLogId } = await setupSubmit({
      reportsRepository,
      data: decemberData
    })

    await submitSummaryLog(summaryLogId, deps)

    expect(mockRecordDecemberWasteRows).toHaveBeenCalledWith(
      { processingType: 'REPROCESSOR_INPUT' },
      1
    )
  })
})

describe('submitSummaryLog row-state numbers', () => {
  it.each([
    {
      accreditationId: 'acc-123',
      accreditationNumber: toAccreditationNumber('ACC-123')
    },
    { accreditationId: null, accreditationNumber: null }
  ])(
    'stores the numbers from the organisation record on each row state, accreditation $accreditationId',
    async ({ accreditationId, accreditationNumber }) => {
      const { deps, summaryLogId, summaryLog, organisation, reportKey } =
        await setupSubmit({
          reportsRepository: createInMemoryReportsRepository()(),
          accreditationId,
          accreditationNumber
        })

      await submitSummaryLog(summaryLogId, deps)

      const rowStates =
        await deps.summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
          reportKey.organisationNumber,
          reportKey.registrationNumber,
          summaryLog.file.id
        )
      expect(rowStates).toEqual([
        expect.objectContaining({
          organisationNumber: organisation.organisationNumber,
          registrationNumber: 'REG-123',
          accreditationNumber
        }),
        expect.objectContaining({
          organisationNumber: organisation.organisationNumber,
          registrationNumber: 'REG-123',
          accreditationNumber
        })
      ])
    }
  )
})

describe('submitSummaryLog for an accreditation stored by number only', () => {
  /** @param {boolean} accreditationStoredByNumberOnly */
  const submitAndRead = async (accreditationStoredByNumberOnly) => {
    const { deps, summaryLogId, summaryLog, reportKey } = await setupSubmit({
      reportsRepository: createInMemoryReportsRepository()(),
      accreditationStoredByNumberOnly
    })

    await submitSummaryLog(summaryLogId, deps)

    const balance = await deps.wasteBalanceService.currentBalance({
      organisationNumber: reportKey.organisationNumber,
      registrationNumber: reportKey.registrationNumber,
      accreditationNumber: toAccreditationNumber('ACC-123')
    })
    const rowStates =
      await deps.summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
        reportKey.organisationNumber,
        reportKey.registrationNumber,
        summaryLog.file.id
      )
    return { balance, rowStates, reportKey }
  }

  it('credits its ledger and classifies its rows as it would with an id', async () => {
    const withId = await submitAndRead(false)
    const byNumberOnly = await submitAndRead(true)

    expect(byNumberOnly.balance?.amount).toBeGreaterThan(0)
    expect(byNumberOnly.balance?.amount).toBe(withId.balance?.amount)
    expect(
      byNumberOnly.rowStates.map(({ rowId, classification }) => ({
        rowId,
        classification
      }))
    ).toEqual(
      withId.rowStates.map(({ rowId, classification }) => ({
        rowId,
        classification
      }))
    )
  })

  it('stores its row states by number', async () => {
    const { rowStates, reportKey } = await submitAndRead(true)

    const numbers = {
      organisationNumber: reportKey.organisationNumber,
      registrationNumber: 'REG-123',
      accreditationNumber: 'ACC-123'
    }
    expect(rowStates).toEqual([
      expect.objectContaining(numbers),
      expect.objectContaining(numbers)
    ])
  })
})
