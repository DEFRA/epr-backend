/** @import { SummaryLog } from '#domain/summary-logs/model.js' */
/** @import { CreateReportParams } from '#reports/repository/port.js' */
import { toYear } from '#common/helpers/dates/year.js'
import { vi } from 'vitest'
import { ObjectId } from 'mongodb'

import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { pickLedgerId } from '#waste-balances/repository/ledger-schema.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  ACCREDITATION_STATUS,
  ORGANISATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import {
  buildAccreditation,
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
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
  createRegisteredOnlyMeta,
  createRegisteredOnlyReceivedRow,
  createStandardMeta,
  tableOf
} from '#routes/v1/organisations/registrations/summary-logs/integration-test-helpers.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { summaryLogRowStatesForLedger } from '#waste-records/application/read-summary-log-row-states.js'
import { createMockLogger } from '#test/mock-logger.js'
import {
  createInMemoryOrganisationReadRepository,
  accreditationsByYear,
  buildReadAccreditation,
  buildReadOrganisation as buildServedOrganisation,
  buildReadReprocessorRegistration,
  withStandingThrough
} from '#organisation-read-model/test-support.js'
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

const VALID_FROM = '2026-01-01'
const VALID_TO = '2026-12-31'

/**
 * @param {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog['meta']} meta
 * @returns {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog['meta']}
 */
const forRegistration = (meta) => ({
  ...meta,
  REGISTRATION_NUMBER: { ...meta.REGISTRATION_NUMBER, value: 'REG-123' }
})

const META = forRegistration(createStandardMeta('REPROCESSOR_INPUT'))
const REGISTERED_ONLY_META = forRegistration(
  createRegisteredOnlyMeta('REPROCESSOR_REGISTERED_ONLY')
)

/**
 * The builder's default tonnage breaches the maximum weight, and submission
 * now needs a log that validates.
 *
 * @param {Parameters<typeof createReprocessorReceivedRowValues>[0]} overrides
 */
const receivedRow = (overrides) =>
  createReprocessorReceivedRowValues({ tonnageReceived: 100, ...overrides })

const RECEIVED_DATA = {
  RECEIVED_LOADS_FOR_REPROCESSING: {
    location: { sheet: 'Received', row: 7, column: 'A' },
    headers: REPROCESSOR_RECEIVED_HEADERS,
    rows: [
      { rowNumber: 8, values: receivedRow({ rowId: 1001 }) },
      { rowNumber: 9, values: receivedRow({ rowId: 1002 }) }
    ]
  }
}

const REGISTERED_ONLY_DATA = {
  RECEIVED_LOADS_FOR_REPROCESSING: tableOf('Received', [
    createRegisteredOnlyReceivedRow({ rowId: 1001, month: '2026-01-01' }),
    createRegisteredOnlyReceivedRow({ rowId: 1002, month: '2026-02-01' })
  ])
}

const SUBMIT_USER = {
  id: 'user-123',
  email: 'operator@example.com',
  scope: ['some-scope'],
  role: null
}

const CREATED_AT = '2024-12-01T00:00:00.000Z'
const APPROVED_AT = '2024-12-15T00:00:00.000Z'

const buildTestOrg = (organisationId, registrationId) => {
  const accreditationId = 'acc-123'
  const testOrg = buildReadOrganisation({
    registrations: [
      partialMock(
        buildRegistration({
          id: registrationId,
          registrationNumber: toRegistrationNumber('REG-123'),
          statusHistory: [
            { status: REGISTRATION_STATUS.CREATED, updatedAt: CREATED_AT },
            { status: REGISTRATION_STATUS.APPROVED, updatedAt: APPROVED_AT }
          ],
          material: 'paper',
          wasteProcessingType: 'reprocessor',
          reprocessingType: 'input',
          submittedToRegulator: 'ea',
          validFrom: VALID_FROM,
          accreditationId
        })
      )
    ],
    accreditations: [
      buildAccreditation({
        id: accreditationId,
        accreditationNumber: toAccreditationNumber('ACC-123'),
        statusHistory: [
          { status: ACCREDITATION_STATUS.CREATED, updatedAt: CREATED_AT },
          { status: ACCREDITATION_STATUS.APPROVED, updatedAt: APPROVED_AT }
        ],
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
 * @param {boolean} [options.accreditationHeldExternally] - hold the accreditation outside epr-backend, with no database id, as one from 2027 is
 */
const setupSubmit = async ({
  reportsRepository,
  createdAt,
  data,
  loadsByReportingPeriod,
  accreditationId = 'acc-123',
  accreditationNumber = toAccreditationNumber('ACC-123'),
  accreditationHeldExternally = false
}) => {
  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()
  const logger = createMockLogger()

  const summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
  const organisation = buildTestOrg(organisationId, registrationId)
  if (accreditationHeldExternally) {
    organisation.accreditations = []
    delete (
      /** @type {Record<string, unknown>} */ (organisation.registrations[0])
        .accreditationId
    )
  }
  // Held in epr-backend or outside it, the read model serves the accreditation
  // the same way.
  const approved = {
    current: /** @type {const} */ ('approved'),
    lastUpdatedAt: APPROVED_AT,
    timeline: [
      {
        status: /** @type {const} */ ('approved'),
        at: `${VALID_FROM}T00:00:00.000Z`
      }
    ]
  }
  const organisationReadRepository = createInMemoryOrganisationReadRepository([
    buildServedOrganisation({
      organisationNumber: organisation.organisationNumber,
      registrations: {
        [toRegistrationNumber('REG-123')]: withStandingThrough(
          buildReadReprocessorRegistration({
            material: 'paper',
            status: approved,
            accreditations: accreditationNumber
              ? accreditationsByYear(
                  buildReadAccreditation({
                    accreditationNumber: toAccreditationNumber('ACC-123'),
                    status: approved
                  })
                )
              : {}
          }),
          toYear(2027)
        )
      }
    })
  ])()
  const reportKey = reportKeyOf(organisation, organisation.registrations[0])

  const summaryLog = summaryLogFactory.validating({
    organisationId,
    registrationId,
    ...reportKey,
    year: toYear(2026),
    accreditationId,
    accreditationNumber,
    ...(createdAt && { createdAt })
  })
  const summaryLogId = toSummaryLogId(`submit-${organisationId}`)
  await summaryLogsRepository.insert(summaryLogId, summaryLog)

  let fileAvailable = true
  const fileStore = createInMemorySummaryLogExtractor({
    [summaryLog.file.id]: accreditationNumber
      ? { meta: META, data: data ?? RECEIVED_DATA }
      : { meta: REGISTERED_ONLY_META, data: data ?? REGISTERED_ONLY_DATA }
  })
  /** @type {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} */
  const summaryLogExtractor = {
    extract: async (log, options) => {
      if (!fileAvailable) {
        throw new Error('The summary log file is no longer available')
      }
      return fileStore.extract(log, options)
    }
  }

  const ledgerRepository = createInMemoryLedgerRepository()()

  const deps = {
    logger,
    summaryLogsRepository,
    organisationReadRepository,
    summaryLogRowStatesRepository:
      createInMemorySummaryLogRowStatesRepository()(),
    ledgerRepository,
    wasteBalanceService: createWasteBalanceService(ledgerRepository),
    summaryLogExtractor,
    reportsService: createReportsService(reportsRepository),
    user: SUBMIT_USER,
    onSummaryLogUploaded: vi.fn().mockResolvedValue(undefined)
  }

  await createSummaryLogsValidator(deps)(summaryLogId)
  const validated = await waitForVersion(summaryLogsRepository, summaryLogId, 2)
  expect(validated.summaryLog.validation?.issues).toEqual([])
  expect(validated.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)

  // Seeded after validation, which computes its own, so the test controls it.
  if (loadsByReportingPeriod) {
    await summaryLogsRepository.update(summaryLogId, validated.version, {
      loadsByReportingPeriod
    })
    await waitForVersion(summaryLogsRepository, summaryLogId, 3)
  }

  const submitting =
    await summaryLogsRepository.transitionToSubmittingExclusive(summaryLogId)
  expect(submitting.success).toBe(true)
  const submittingVersion = submitting.version
  await waitForVersion(summaryLogsRepository, summaryLogId, submittingVersion)

  return {
    deps,
    summaryLogId,
    summaryLog: submitting.summaryLog,
    submittingVersion,
    organisation,
    reportKey,
    organisationReadRepository,
    summaryLogsRepository,
    removeFile: () => {
      fileAvailable = false
    }
  }
}

describe('submitSummaryLog staleness guard (period closure)', () => {
  it('rejects when a report was submitted after the summary log was created', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    const {
      deps,
      summaryLogId,
      summaryLog: { year },
      reportKey,
      summaryLogsRepository,
      submittingVersion
    } = await setupSubmit({
      reportsRepository,
      createdAt: '2025-01-01T00:00:00.000Z'
    })

    // A periodic report of the log's year closes for this registration after
    // the log was created: its SUBMITTED status.history entry is stamped "now",
    // well after 2025.
    await createAndSubmitReport(reportsRepository, {
      ...reportKey,
      year
    })

    await expect(submitSummaryLog(summaryLogId, deps)).rejects.toBeInstanceOf(
      PermanentError
    )

    // The guard throws before any write, so the log is untouched.
    const { summaryLog, version } = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      submittingVersion
    )
    expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTING)
    expect(version).toBe(submittingVersion)
  })

  it('proceeds when a report for a different year was submitted after the summary log was created', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    const {
      deps,
      summaryLogId,
      summaryLog: { year },
      reportKey,
      summaryLogsRepository,
      submittingVersion
    } = await setupSubmit({
      reportsRepository,
      createdAt: '2025-01-01T00:00:00.000Z'
    })

    await createAndSubmitReport(reportsRepository, {
      ...reportKey,
      year: toYear(year - 1)
    })

    await submitSummaryLog(summaryLogId, deps)

    const { summaryLog } = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      submittingVersion + 1
    )
    expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
  })

  it('proceeds and writes records when no report has been submitted since creation', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    const {
      deps,
      summaryLogId,
      summaryLog: { year },
      reportKey,
      summaryLogsRepository,
      submittingVersion
    } = await setupSubmit({ reportsRepository })

    // An open (never-submitted) report of the log's year exists for the
    // registration: the guard reacts only to SUBMITTED closures, so submission
    // must still proceed.
    await reportsRepository.createReport(
      buildCreateReportParams({ ...reportKey, year })
    )

    await submitSummaryLog(summaryLogId, deps)

    const rowStates = await summaryLogRowStatesForLedger({
      ...reportKey,
      accreditationNumber: toAccreditationNumber('ACC-123'),
      year,
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
      submittingVersion + 1
    )
    expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
  })

  it('ignores a report last submitted before the summary log was created', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    // The log is created far in the future, after any real submission, so the
    // seeded closure predates it and the guard must not fire.
    const {
      deps,
      summaryLogId,
      summaryLog: { year },
      reportKey,
      summaryLogsRepository,
      submittingVersion
    } = await setupSubmit({
      reportsRepository,
      createdAt: '2099-01-01T00:00:00.000Z'
    })

    await createAndSubmitReport(reportsRepository, {
      ...reportKey,
      year
    })

    await submitSummaryLog(summaryLogId, deps)

    const { summaryLog } = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      submittingVersion + 1
    )
    expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
  })
})

describe('submitSummaryLog resubmission flag source', () => {
  const january = { year: toYear(2026), cadence: 'monthly', period: 1 }
  const february = { year: toYear(2026), cadence: 'monthly', period: 2 }

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
})

describe('submitSummaryLog stale flagging', () => {
  it('marks reports stale only once the summary log is submitted, so a report built in between reads it', async () => {
    const { deps, summaryLogId, summaryLogsRepository } = await setupSubmit({
      reportsRepository: createInMemoryReportsRepository()()
    })
    const update = vi.spyOn(summaryLogsRepository, 'update')

    await submitSummaryLog(summaryLogId, deps)

    const [submittedOrder] = update.mock.calls.flatMap(([, , changes], i) =>
      changes.status === SUMMARY_LOG_STATUS.SUBMITTED
        ? [update.mock.invocationCallOrder[i]]
        : []
    )
    const [markedStaleOrder] = vi.mocked(deps.onSummaryLogUploaded).mock
      .invocationCallOrder
    expect(submittedOrder).toBeLessThan(markedStaleOrder)
  })

  /**
   * Submits a log over one active report, through the real
   * summary-log-uploaded handler, and returns the report and the log.
   *
   * @param {(summaryLog: SummaryLog) => Partial<CreateReportParams>} reportOverrides
   */
  const submitOverActiveReport = async (reportOverrides) => {
    const reportsRepository = createInMemoryReportsRepository()()
    const { deps, summaryLogId, summaryLog, reportKey } = await setupSubmit({
      reportsRepository,
      createdAt: '2099-01-01T00:00:00.000Z'
    })
    const { id: reportId } = await reportsRepository.createReport(
      buildCreateReportParams({ ...reportKey, ...reportOverrides(summaryLog) })
    )

    await submitSummaryLog(summaryLogId, {
      ...deps,
      onSummaryLogUploaded: createOnSummaryLogUploaded({
        reportsRepository,
        systemLogsRepository: createSystemLogsRepository()(deps.logger)
      })
    })

    return {
      report: await reportsRepository.findReportById(reportId),
      summaryLog
    }
  }

  it('marks stale an active report for the summary log year', async () => {
    const { report, summaryLog } = await submitOverActiveReport(({ year }) => ({
      year
    }))

    expect(report.stale?.summaryLogChanged?.summaryLogId).toBe(
      summaryLog.file.id
    )
  })

  it('leaves alone an active report for a different year', async () => {
    const { report } = await submitOverActiveReport(({ year }) => ({
      year: toYear(year - 1)
    }))

    expect(report.stale).toBeUndefined()
  })

  it('leaves alone an active report already built from the summary log being submitted', async () => {
    const { report } = await submitOverActiveReport(({ year, file }) => ({
      year,
      source: {
        summaryLogId: file.id,
        lastUploadedAt: '2099-01-01T00:00:00.000Z'
      }
    }))

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
            values: receivedRow({
              rowId: 1001,
              dateReceived: '2026-12-15T00:00:00.000Z'
            })
          },
          {
            rowNumber: 9,
            values: receivedRow({
              rowId: 1002,
              dateReceived: '2026-06-15T00:00:00.000Z'
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

describe('submitSummaryLog for an accreditation held outside epr-backend', () => {
  /** @param {boolean} accreditationHeldExternally */
  const submitAndRead = async (accreditationHeldExternally) => {
    const { deps, summaryLogId, summaryLog, reportKey } = await setupSubmit({
      reportsRepository: createInMemoryReportsRepository()(),
      accreditationHeldExternally
    })

    await submitSummaryLog(summaryLogId, deps)

    const balance = await deps.wasteBalanceService.currentBalance({
      organisationNumber: reportKey.organisationNumber,
      registrationNumber: reportKey.registrationNumber,
      accreditationNumber: toAccreditationNumber('ACC-123'),
      year: summaryLog.year
    })
    const rowStates =
      await deps.summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
        reportKey.organisationNumber,
        reportKey.registrationNumber,
        summaryLog.file.id
      )
    return { balance, rowStates, reportKey }
  }

  it('credits its ledger and classifies its rows as it would a stored one', async () => {
    const stored = await submitAndRead(false)
    const external = await submitAndRead(true)

    expect(external.balance?.amount).toBeGreaterThan(0)
    expect(external.balance?.amount).toBe(stored.balance?.amount)
    expect(
      external.rowStates.map(({ rowId, classification }) => ({
        rowId,
        classification
      }))
    ).toEqual(
      stored.rowStates.map(({ rowId, classification }) => ({
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

describe('submitSummaryLog commits what validation saved', () => {
  it('supersedes a log validated before its commit was saved, committing nothing', async () => {
    const { deps, summaryLog, reportKey, summaryLogsRepository } =
      await setupSubmit({
        reportsRepository: createInMemoryReportsRepository()()
      })
    const validatedBeforeRelease = toSummaryLogId(
      `before-${summaryLog.file.id}`
    )
    await summaryLogsRepository.insert(
      validatedBeforeRelease,
      summaryLogFactory.submitting({
        ...reportKey,
        year: summaryLog.year,
        accreditationNumber: summaryLog.accreditationNumber,
        meta: { PROCESSING_TYPE: 'REPROCESSOR_INPUT' }
      })
    )

    await submitSummaryLog(validatedBeforeRelease, deps)

    const stored = await waitForVersion(
      summaryLogsRepository,
      validatedBeforeRelease,
      2
    )
    expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUPERSEDED)
    expect(
      await deps.wasteBalanceService.currentBalance(pickLedgerId(summaryLog))
    ).toBeNull()
  })

  it('supersedes the log when its accreditation changed after validation, committing nothing', async () => {
    const {
      deps,
      summaryLogId,
      summaryLog,
      submittingVersion,
      summaryLogsRepository,
      organisationReadRepository
    } = await setupSubmit({
      reportsRepository: createInMemoryReportsRepository()()
    })
    const { findByOrganisationNumber } = organisationReadRepository
    vi.spyOn(
      organisationReadRepository,
      'findByOrganisationNumber'
    ).mockImplementation(async (...args) => {
      const organisation = await findByOrganisationNumber(...args)
      organisation?.registrations['REG-123']?.accreditations[
        summaryLog.year
      ]?.status.timeline.push({
        status: 'suspended',
        at: '2026-03-01T00:00:00.000Z'
      })
      return organisation
    })

    await submitSummaryLog(summaryLogId, deps)

    const stored = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      submittingVersion + 1
    )
    expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUPERSEDED)
    expect(
      await deps.wasteBalanceService.currentBalance(pickLedgerId(summaryLog))
    ).toBeNull()
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          action: 'summary_log_superseded',
          reason: 'context_changed'
        })
      })
    )
  })

  it("stamps a registered-only submission's event with the submitter's name", async () => {
    const { deps, summaryLogId, summaryLog } = await setupSubmit({
      reportsRepository: createInMemoryReportsRepository()(),
      accreditationId: null,
      accreditationNumber: null
    })

    await submitSummaryLog(summaryLogId, {
      ...deps,
      user: { ...SUBMIT_USER, name: 'Olive Operator' }
    })

    const event = await deps.ledgerRepository.findLatestInLedger(
      pickLedgerId(summaryLog)
    )
    expect(event?.createdBy).toEqual({
      id: SUBMIT_USER.id,
      name: 'Olive Operator',
      email: SUBMIT_USER.email
    })
  })
})
