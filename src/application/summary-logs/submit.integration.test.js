import { ObjectId } from 'mongodb'

import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { buildReadOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildCreateReportParams,
  createAndSubmitReport
} from '#reports/repository/contract/test-data.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createReportsService } from '#reports/application/report-service.js'
import {
  REPROCESSOR_RECEIVED_HEADERS,
  createReprocessorReceivedRowValues,
  createStandardMeta
} from '#routes/v1/organisations/registrations/summary-logs/integration-test-helpers.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { createMockLogger } from '#test/mock-logger.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

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
      {
        id: registrationId,
        registrationNumber: 'REG-123',
        status: 'approved',
        material: 'paper',
        wasteProcessingType: 'reprocessor',
        reprocessingType: 'input',
        submittedToRegulator: 'ea',
        validFrom: VALID_FROM,
        validTo: VALID_TO,
        accreditationId
      }
    ],
    accreditations: [
      {
        id: accreditationId,
        accreditationNumber: 'ACC-123',
        material: 'paper',
        wasteProcessingType: 'reprocessor',
        reprocessingType: 'input',
        submittedToRegulator: 'ea',
        validFrom: VALID_FROM,
        validTo: VALID_TO
      }
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
 */
const setupSubmit = async ({ reportsRepository, createdAt }) => {
  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()
  const logger = createMockLogger()

  const summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
  const organisationsRepository = createInMemoryOrganisationsRepository([
    buildTestOrg(organisationId, registrationId)
  ])()
  const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

  const summaryLog = summaryLogFactory.submitting({
    organisationId,
    registrationId,
    ...(createdAt && { createdAt })
  })
  const summaryLogId = `submit-${organisationId}`
  await summaryLogsRepository.insert(summaryLogId, summaryLog)

  const summaryLogExtractor = createInMemorySummaryLogExtractor({
    [summaryLog.file.id]: { meta: META, data: RECEIVED_DATA }
  })

  const deps = {
    logger,
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogRowStatesRepository:
      createInMemorySummaryLogRowStateRepository()(),
    wasteBalanceService: createWasteBalanceService(
      createInMemoryLedgerRepository()()
    ),
    featureFlags: createInMemoryFeatureFlags(),
    summaryLogExtractor,
    overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
    reportsService: createReportsService(reportsRepository),
    user: SUBMIT_USER,
    onSummaryLogUploaded: vi.fn().mockResolvedValue(undefined)
  }

  return {
    deps,
    summaryLogId,
    organisationId,
    registrationId,
    summaryLogsRepository,
    wasteRecordsRepository
  }
}

describe('submitSummaryLog staleness guard (period closure)', () => {
  it('rejects when a report was submitted after the summary log was created', async () => {
    const reportsRepository = createInMemoryReportsRepository()()
    const {
      deps,
      summaryLogId,
      organisationId,
      registrationId,
      wasteRecordsRepository,
      summaryLogsRepository
    } = await setupSubmit({
      reportsRepository,
      createdAt: '2024-01-01T00:00:00.000Z'
    })

    // A periodic report closes for this registration after the log was created:
    // its SUBMITTED status.history entry is stamped "now", well after 2024.
    await createAndSubmitReport(reportsRepository, {
      organisationId,
      registrationId
    })

    await expect(submitSummaryLog(summaryLogId, deps)).rejects.toBeInstanceOf(
      PermanentError
    )

    const wasteRecords = await wasteRecordsRepository.findByRegistration(
      organisationId,
      registrationId
    )
    expect(wasteRecords).toEqual([])

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
    const {
      deps,
      summaryLogId,
      organisationId,
      registrationId,
      wasteRecordsRepository,
      summaryLogsRepository
    } = await setupSubmit({ reportsRepository })

    // An open (never-submitted) report exists for the registration: the guard
    // reacts only to SUBMITTED closures, so submission must still proceed.
    await reportsRepository.createReport(
      buildCreateReportParams({ organisationId, registrationId })
    )

    await submitSummaryLog(summaryLogId, deps)

    const wasteRecords = await wasteRecordsRepository.findByRegistration(
      organisationId,
      registrationId
    )
    expect(wasteRecords).toHaveLength(2)
    expect(wasteRecords.map((record) => record.rowId)).toEqual(['1001', '1002'])

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
    const {
      deps,
      summaryLogId,
      organisationId,
      registrationId,
      summaryLogsRepository
    } = await setupSubmit({
      reportsRepository,
      createdAt: '2099-01-01T00:00:00.000Z'
    })

    await createAndSubmitReport(reportsRepository, {
      organisationId,
      registrationId
    })

    await submitSummaryLog(summaryLogId, deps)

    const { summaryLog } = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      2
    )
    expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
  })
})
