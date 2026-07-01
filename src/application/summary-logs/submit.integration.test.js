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
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createMockWasteBalancesRepository } from '#test/mock-repositories.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

const VALID_FROM = '2025-01-01'
const VALID_TO = '2025-12-31'

const META = {
  REGISTRATION_NUMBER: {
    value: 'REG-123',
    location: { sheet: 'Data', row: 1, column: 'B' }
  },
  PROCESSING_TYPE: {
    value: 'REPROCESSOR_INPUT',
    location: { sheet: 'Data', row: 2, column: 'B' }
  },
  MATERIAL: {
    value: 'Paper_and_board',
    location: { sheet: 'Data', row: 3, column: 'B' }
  },
  TEMPLATE_VERSION: {
    value: 5,
    location: { sheet: 'Data', row: 4, column: 'B' }
  },
  ACCREDITATION_NUMBER: {
    value: 'ACC-123',
    location: { sheet: 'Data', row: 5, column: 'B' }
  }
}

const RECEIVED_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_REPROCESSING',
  'EWC_CODE',
  'DESCRIPTION_WASTE',
  'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  'GROSS_WEIGHT',
  'TARE_WEIGHT',
  'PALLET_WEIGHT',
  'NET_WEIGHT',
  'BAILING_WIRE_PROTOCOL',
  'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
  'WEIGHT_OF_NON_TARGET_MATERIALS',
  'RECYCLABLE_PROPORTION_PERCENTAGE',
  'TONNAGE_RECEIVED_FOR_RECYCLING',
  'SUPPLIER_NAME',
  'SUPPLIER_ADDRESS',
  'SUPPLIER_POSTCODE',
  'SUPPLIER_EMAIL',
  'SUPPLIER_PHONE_NUMBER',
  'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER',
  'YOUR_REFERENCE',
  'WEIGHBRIDGE_TICKET',
  'CARRIER_NAME',
  'CBD_REG_NUMBER',
  'CARRIER_VEHICLE_REGISTRATION_NUMBER'
]

const receivedRow = (
  rowNumber,
  rowId,
  netWeight,
  nonTargetWeight,
  tonnage
) => ({
  rowNumber,
  values: [
    rowId,
    '2025-01-15T00:00:00.000Z',
    '03 03 08',
    'Glass - pre-sorted',
    'No',
    netWeight + 150,
    100,
    50,
    netWeight,
    'Yes',
    'Actual weight (100%)',
    nonTargetWeight,
    0.85,
    tonnage,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ]
})

const RECEIVED_DATA = {
  RECEIVED_LOADS_FOR_REPROCESSING: {
    location: { sheet: 'Received', row: 7, column: 'A' },
    headers: RECEIVED_HEADERS,
    rows: [
      receivedRow(8, 1001, 850, 50, 678.98),
      receivedRow(9, 1002, 765, 45, 611.028)
    ]
  }
}

const SUBMIT_USER = {
  id: 'user-123',
  email: 'operator@example.com',
  scope: ['standard_user'],
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
    wasteRecordStatesRepository: createInMemoryRowStateRepository()(),
    wasteBalancesRepository: createMockWasteBalancesRepository(),
    featureFlags: createInMemoryFeatureFlags(),
    summaryLogExtractor,
    overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
    reportsRepository,
    user: SUBMIT_USER,
    onSummaryLogSubmittedReportHook: vi.fn().mockResolvedValue(undefined)
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
