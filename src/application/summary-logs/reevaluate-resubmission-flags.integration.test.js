import { http, HttpResponse } from 'msw'
import { ObjectId } from 'mongodb'
import { vi } from 'vitest'

import { reevaluateResubmissionFlags } from '#application/summary-logs/reevaluate-resubmission-flags.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createReportForPeriod } from '#reports/application/report-service.js'
import { requestOperatorResubmission } from '#reports/application/resubmission-service.js'
import { createOnSummaryLogUploaded } from '#reports/application/summary-log-events.js'
import {
  MONTHLY_PERIODS,
  QUARTERLY_PERIODS
} from '#reports/domain/period-labels.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import {
  asOperator,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createReprocessorReceivedRowValues,
  createWasteBalanceMeta,
  pollForValidation,
  pollWhileStatus,
  REPROCESSOR_RECEIVED_HEADERS,
  setupWasteBalanceIntegrationEnvironment
} from '#routes/v1/organisations/registrations/summary-logs/integration-test-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const TABLE_HEADER_ROW = 7
const FIRST_DATA_ROW = TABLE_HEADER_ROW + 1
const SUBMIT_MAX_POLL_ATTEMPTS = 10

const JANUARY_2025 = {
  year: 2025,
  cadence: /** @type {const} */ ('monthly'),
  period: MONTHLY_PERIODS.January
}

const FEBRUARY_2025 = {
  year: 2025,
  cadence: /** @type {const} */ ('monthly'),
  period: MONTHLY_PERIODS.February
}
const FEBRUARY_DATE = '2025-02-15T00:00:00.000Z'

const Q1_2025 = {
  year: 2025,
  cadence: /** @type {const} */ ('quarterly'),
  period: QUARTERLY_PERIODS.Q1
}

const CHANGED_BY = { id: 'u1', name: 'Test User', position: 'Officer' }

const FIRST_UPLOAD = [
  { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-ORIGINAL' }
]

const meta = createWasteBalanceMeta('REPROCESSOR_INPUT')

const createUploadData = (rows) => ({
  RECEIVED_LOADS_FOR_REPROCESSING: {
    location: { sheet: 'Received', row: TABLE_HEADER_ROW, column: 'A' },
    headers: REPROCESSOR_RECEIVED_HEADERS,
    rows: rows.map((row, index) => ({
      rowNumber: FIRST_DATA_ROW + index,
      values: createReprocessorReceivedRowValues(row)
    }))
  }
})

const reprocessorFile = (rows) => ({ meta, data: createUploadData(rows) })

const registeredOnlyExporterMeta = {
  REGISTRATION_NUMBER: {
    value: 'REG-123',
    location: { sheet: 'Cover', row: 1, column: 'B' }
  },
  PROCESSING_TYPE: {
    value: 'EXPORTER_REGISTERED_ONLY',
    location: { sheet: 'Cover', row: 2, column: 'B' }
  },
  MATERIAL: {
    value: 'Paper_and_board',
    location: { sheet: 'Cover', row: 3, column: 'B' }
  },
  TEMPLATE_VERSION: {
    value: 2.1,
    location: { sheet: 'Cover', row: 4, column: 'B' }
  }
}

const LOADS_EXPORTED_HEADERS = [
  'ROW_ID',
  'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
  'DATE_OF_EXPORT',
  'OSR_ID',
  'BASEL_EXPORT_CODE',
  'WAS_THE_WASTE_REFUSED',
  'WAS_THE_WASTE_STOPPED',
  'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED',
  'OSR_NAME',
  'OSR_COUNTRY',
  'CUSTOMS_CODES',
  'CONTAINER_NUMBER'
]

// OSR_ID 100 resolves to a registered overseas site, so the report takes the
// site's name and country from the ORS registry, not from these cells.
const registeredOnlyExporterFile = ({ osrName, osrCountry }) => ({
  meta: registeredOnlyExporterMeta,
  data: {
    LOADS_EXPORTED: {
      location: { sheet: 'Exported', row: TABLE_HEADER_ROW, column: 'A' },
      headers: LOADS_EXPORTED_HEADERS,
      rows: [
        {
          rowNumber: FIRST_DATA_ROW,
          values: [
            2001,
            100,
            '2025-01-20T00:00:00.000Z',
            100,
            'B3020',
            'No',
            'No',
            null,
            osrName,
            osrCountry,
            '123456',
            'CONT123456'
          ]
        }
      ]
    }
  }
})

const setupEnvironment = async ({
  resubmissionFigureGateEnabled = false,
  processingType = 'reprocessor',
  accredited = true
} = {}) => {
  const env = await setupWasteBalanceIntegrationEnvironment({
    processingType,
    accredited,
    organisationId: new ObjectId().toString(),
    registrationId: new ObjectId().toString(),
    resubmissionFigureGateEnabled
  })
  const systemLogsRepository = createSystemLogsRepository()(env.logger)
  return { ...env, systemLogsRepository }
}

const upload = async (env, summaryLogId, fileId, file) => {
  const { server, fileDataMap, organisationId, registrationId } = env

  fileDataMap[fileId] = file

  await server.inject({
    method: 'POST',
    url: buildPostUrl(organisationId, registrationId, summaryLogId),
    payload: {
      uploadStatus: 'ready',
      metadata: { organisationId, registrationId },
      form: {
        summaryLogUpload: {
          fileId,
          filename: 'waste-data.xlsx',
          fileStatus: UPLOAD_STATUS.COMPLETE,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          contentLength: 12345,
          checksumSha256: 'abc123',
          detectedContentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          s3Bucket: 'test-bucket',
          s3Key: `path/to/${fileId}`
        }
      },
      numberOfRejectedFiles: 0
    }
  })

  await pollForValidation(server, organisationId, registrationId, summaryLogId)
}

const loadsByReportingPeriodOf = async (env, summaryLogId) => {
  const response = await env.server.inject({
    method: 'GET',
    url: buildGetUrl(env.organisationId, env.registrationId, summaryLogId),
    ...asOperator()
  })
  return JSON.parse(response.payload).loadsByReportingPeriod
}

const submit = async (env, summaryLogId) => {
  const { server, organisationId, registrationId } = env

  await server.inject({
    method: 'POST',
    url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
    ...asOperator()
  })

  await pollWhileStatus(server, organisationId, registrationId, summaryLogId, {
    waitWhile: SUMMARY_LOG_STATUS.SUBMITTING,
    maxAttempts: SUBMIT_MAX_POLL_ATTEMPTS
  })
}

const generateReport = async (
  env,
  { year, cadence, period },
  submissionNumber = 1
) => {
  const registration = await env.organisationsRepository.findRegistrationById(
    env.organisationId,
    env.registrationId
  )
  return createReportForPeriod({
    reportsRepository: env.reportsRepository,
    ledgerRepository: env.ledgerRepository,
    summaryLogRowStatesRepository: env.summaryLogRowStatesRepository,
    packagingRecyclingNotesRepository: env.packagingRecyclingNotesRepository,
    overseasSitesRepository: env.overseasSitesRepository,
    organisationId: env.organisationId,
    registrationId: env.registrationId,
    registration,
    year,
    cadence,
    period,
    submissionNumber,
    changedBy: CHANGED_BY
  })
}

const generateAndSubmitReport = async (env, period, submissionNumber = 1) => {
  const report = await generateReport(env, period, submissionNumber)

  await env.reportsRepository.updateReportStatus({
    reportId: report.id,
    version: report.version,
    status: REPORT_STATUS.READY_TO_SUBMIT,
    slot: REPORT_STATUS_SLOT.READY,
    changedBy: CHANGED_BY
  })
  await env.reportsRepository.updateReportStatus({
    reportId: report.id,
    version: report.version + 1,
    status: REPORT_STATUS.SUBMITTED,
    slot: REPORT_STATUS_SLOT.SUBMITTED,
    changedBy: CHANGED_BY,
    submissionDeclaredBy: 'Test User'
  })

  return report.id
}

const submitAndCloseJanuary = async (env) => {
  await upload(env, 'sl-first', 'file-first', reprocessorFile(FIRST_UPLOAD))
  await submit(env, 'sl-first')
  return generateAndSubmitReport(env, JANUARY_2025)
}

// Flags as submit did before the figure gate: every restated closed period.
const uploadFileAndSubmitFlaggingEveryClosedPeriod = async (
  env,
  summaryLogId,
  fileId,
  file
) => {
  await upload(env, summaryLogId, fileId, file)
  const loadsByReportingPeriod = await loadsByReportingPeriodOf(
    env,
    summaryLogId
  )
  await submit(env, summaryLogId)
  await createOnSummaryLogUploaded(env)({
    organisationId: env.organisationId,
    registrationId: env.registrationId,
    summaryLogId,
    periodsRequiringResubmission: loadsByReportingPeriod.closedPeriods
  })
  return loadsByReportingPeriod
}

const uploadAndSubmitFlaggingEveryClosedPeriod = (
  env,
  summaryLogId,
  fileId,
  rows
) =>
  uploadFileAndSubmitFlaggingEveryClosedPeriod(
    env,
    summaryLogId,
    fileId,
    reprocessorFile(rows)
  )

const AMENDED_REFERENCE = [
  { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-AMENDED' }
]
const CHANGED_TONNAGE = [
  { rowId: 1001, tonnageReceived: 500, bailingWire: 'No' }
]

const reevaluate = (env) =>
  reevaluateResubmissionFlags({
    reportsRepository: env.reportsRepository,
    organisationsRepository: env.organisationsRepository,
    summaryLogsRepository: env.summaryLogsRepository,
    ledgerRepository: env.ledgerRepository,
    summaryLogRowStatesRepository: env.summaryLogRowStatesRepository,
    overseasSitesRepository: env.overseasSitesRepository
  })

describe('reevaluateResubmissionFlags', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  it('would clear the flag when the restating upload left the reported figures unchanged, writing nothing', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )
    const flagged = await env.reportsRepository.findReportById(reportId)
    expect(flagged.resubmissionRequired?.closedPeriodRestated).toBeDefined()

    const { outcomes, failures } = await reevaluate(env)

    expect(await env.reportsRepository.findReportById(reportId)).toEqual(
      flagged
    )
    expect(outcomes).toEqual([
      expect.objectContaining({
        reportId,
        period: JANUARY_2025,
        headSummaryLogId: 'file-nonfigure',
        comparison: expect.objectContaining({ changedFields: [] }),
        verdict: 'would-clear',
        operatorRequested: false
      })
    ])
    expect(failures).toEqual([])
  })

  it('keeps the flag when a reported figure changed, naming the fields', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-figure',
      'file-figure',
      CHANGED_TONNAGE
    )
    const flagged = await env.reportsRepository.findReportById(reportId)

    const { outcomes } = await reevaluate(env)

    expect(await env.reportsRepository.findReportById(reportId)).toEqual(
      flagged
    )
    expect(outcomes).toEqual([
      expect.objectContaining({
        reportId,
        comparison: expect.objectContaining({
          changedFields: expect.arrayContaining([
            'recyclingActivity.totalTonnageReceived'
          ])
        }),
        verdict: 'kept'
      })
    ])
  })

  it('would clear the flag when a later upload restores the submitted figures', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-figure',
      'file-figure',
      CHANGED_TONNAGE
    )
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-restored',
      'file-restored',
      FIRST_UPLOAD
    )

    const { outcomes } = await reevaluate(env)

    expect(outcomes).toEqual([
      expect.objectContaining({
        reportId,
        headSummaryLogId: 'file-restored',
        verdict: 'would-clear'
      })
    ])
  })

  it('keeps the flag when a figure changed in an earlier upload than the one that last flagged it', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-figure',
      'file-figure',
      CHANGED_TONNAGE
    )
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      [{ ...CHANGED_TONNAGE[0], yourReference: 'REF-AMENDED' }]
    )
    const flagged = await env.reportsRepository.findReportById(reportId)
    expect(
      flagged.resubmissionRequired?.closedPeriodRestated?.summaryLogId
    ).toBe('sl-nonfigure')

    const { outcomes } = await reevaluate(env)

    expect(outcomes).toEqual([
      expect.objectContaining({ reportId, verdict: 'kept' })
    ])
  })

  it('keeps the flag when the summary log that set it cannot be found', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )
    vi.spyOn(env.summaryLogsRepository, 'findById').mockResolvedValue(null)

    const { outcomes } = await reevaluate(env)

    expect(outcomes).toEqual([
      expect.objectContaining({
        reportId,
        comparison: expect.objectContaining({
          cannotCompare: 'the summary log that flagged it no longer exists'
        }),
        verdict: 'kept'
      })
    ])
  })

  it('ignores a flag on a submission that has since been resubmitted', async () => {
    const env = await setupEnvironment()
    const firstId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )
    await generateAndSubmitReport(env, JANUARY_2025, 2)
    const superseded = await env.reportsRepository.findReportById(firstId)

    const { outcomes } = await reevaluate(env)

    expect(outcomes).toEqual([])
    expect(await env.reportsRepository.findReportById(firstId)).toEqual(
      superseded
    )
  })

  it('keeps the flag when the operator has already started the resubmission', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )
    // The flag is what allowed the draft, so clearing it would strand the draft.
    await generateReport(env, JANUARY_2025, 2)
    const flagged = await env.reportsRepository.findReportById(reportId)

    const { outcomes } = await reevaluate(env)

    expect(await env.reportsRepository.findReportById(reportId)).toEqual(
      flagged
    )
    expect(outcomes).toEqual([
      expect.objectContaining({
        reportId,
        comparison: expect.objectContaining({ changedFields: [] }),
        verdict: 'resubmission-in-progress'
      })
    ])
  })

  it('ignores a report flagged only by the operator', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await requestOperatorResubmission({
      reportsRepository: env.reportsRepository,
      organisationId: env.organisationId,
      registrationId: env.registrationId,
      ...JANUARY_2025,
      submissionNumber: 1,
      requestedBy: CHANGED_BY
    })
    const flagged = await env.reportsRepository.findReportById(reportId)
    expect(flagged.resubmissionRequired?.operatorRequested).toBeDefined()

    const { outcomes, failures } = await reevaluate(env)

    expect(outcomes).toEqual([])
    expect(failures).toEqual([])
    expect(await env.reportsRepository.findReportById(reportId)).toEqual(
      flagged
    )
  })

  it('reports when the operator has also asked to resubmit the report it would clear', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await requestOperatorResubmission({
      reportsRepository: env.reportsRepository,
      organisationId: env.organisationId,
      registrationId: env.registrationId,
      ...JANUARY_2025,
      submissionNumber: 1,
      requestedBy: CHANGED_BY
    })
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )

    const { outcomes } = await reevaluate(env)

    expect(outcomes).toEqual([
      expect.objectContaining({
        reportId,
        verdict: 'would-clear',
        operatorRequested: true
      })
    ])
  })

  it('keeps the flag when a figure changed, even with a resubmission in progress', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-figure',
      'file-figure',
      CHANGED_TONNAGE
    )
    await generateReport(env, JANUARY_2025, 2)

    const { outcomes } = await reevaluate(env)

    expect(outcomes).toEqual([
      expect.objectContaining({ reportId, verdict: 'kept' })
    ])
  })

  it('would clear the flag on a registered-only quarterly report when no reported figure changed', async () => {
    const env = await setupEnvironment({
      processingType: 'exporter',
      accredited: false
    })
    await upload(
      env,
      'sl-first',
      'file-first',
      registeredOnlyExporterFile({
        osrName: 'Site A',
        osrCountry: 'Vietnam-VN'
      })
    )
    await submit(env, 'sl-first')
    const reportId = await generateAndSubmitReport(env, Q1_2025)
    await uploadFileAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-osr',
      'file-osr',
      registeredOnlyExporterFile({ osrName: 'Site B', osrCountry: 'France-FR' })
    )

    const { outcomes, failures } = await reevaluate(env)

    expect(outcomes).toEqual([
      expect.objectContaining({
        reportId,
        period: Q1_2025,
        headSummaryLogId: 'file-osr',
        verdict: 'would-clear'
      })
    ])
    expect(failures).toEqual([])
  })

  it('leaves out a report whose flag went between the scan and the read', async () => {
    const env = await setupEnvironment()
    await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )
    const findReportById = env.reportsRepository.findReportById
    vi.spyOn(env.reportsRepository, 'findReportById').mockImplementation(
      async (id) => {
        const { resubmissionRequired: _flag, ...report } =
          await findReportById(id)
        return report
      }
    )

    const { outcomes, failures } = await reevaluate(env)

    expect(outcomes).toEqual([])
    expect(failures).toEqual([])
  })

  it('carries on past a report it fails to re-evaluate', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )
    vi.spyOn(env.reportsRepository, 'findReportById').mockRejectedValueOnce(
      new Error('reports store unavailable')
    )

    const { outcomes, failures } = await reevaluate(env)

    expect(outcomes).toEqual([])
    expect(failures).toEqual([{ reportId, error: 'reports store unavailable' }])
  })

  it('would clear exactly the restated periods the validation-time gate would not have flagged', async () => {
    const env = await setupEnvironment({ resubmissionFigureGateEnabled: true })
    await upload(
      env,
      'sl-first',
      'file-first',
      reprocessorFile([
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-JAN' },
        {
          rowId: 1002,
          tonnageReceived: 200,
          dateReceived: FEBRUARY_DATE,
          yourReference: 'REF-FEB'
        }
      ])
    )
    await submit(env, 'sl-first')
    await generateAndSubmitReport(env, JANUARY_2025)
    await generateAndSubmitReport(env, FEBRUARY_2025)

    // Both periods are restated, but only February's figures change.
    const { closedPeriods, periodsRequiringResubmission } =
      await uploadAndSubmitFlaggingEveryClosedPeriod(
        env,
        'sl-both',
        'file-both',
        [
          {
            rowId: 1001,
            tonnageReceived: 100,
            yourReference: 'REF-JAN-AMENDED'
          },
          { rowId: 1002, tonnageReceived: 250, dateReceived: FEBRUARY_DATE }
        ]
      )
    expect(closedPeriods).toEqual([JANUARY_2025, FEBRUARY_2025])
    expect(periodsRequiringResubmission).toEqual([FEBRUARY_2025])

    const { outcomes } = await reevaluate(env)

    expect(
      outcomes.map(({ period, verdict }) => ({ period, verdict }))
    ).toEqual(
      expect.arrayContaining([
        { period: JANUARY_2025, verdict: 'would-clear' },
        { period: FEBRUARY_2025, verdict: 'kept' }
      ])
    )
    expect(outcomes).toHaveLength(2)
  })
})
