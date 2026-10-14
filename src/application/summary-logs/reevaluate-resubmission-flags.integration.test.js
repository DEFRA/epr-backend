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
const AMENDED_REFERENCE = [
  { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-AMENDED' }
]
const CHANGED_TONNAGE = [
  { rowId: 1001, tonnageReceived: 500, bailingWire: 'No' }
]

const meta = createWasteBalanceMeta('REPROCESSOR_INPUT')

const reprocessorFile = (rows) => ({
  meta,
  data: {
    RECEIVED_LOADS_FOR_REPROCESSING: {
      location: { sheet: 'Received', row: TABLE_HEADER_ROW, column: 'A' },
      headers: REPROCESSOR_RECEIVED_HEADERS,
      rows: rows.map((row, index) => ({
        rowNumber: FIRST_DATA_ROW + index,
        values: createReprocessorReceivedRowValues(row)
      }))
    }
  }
})

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
// site's name and country from the registry, not from these cells.
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
  processingType = 'reprocessor',
  accredited = true
} = {}) => {
  const env = await setupWasteBalanceIntegrationEnvironment({
    processingType,
    accredited,
    organisationId: new ObjectId().toString(),
    registrationId: new ObjectId().toString()
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

  it('evaluates the latest submission of a period flagged because a closed period was restated', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )
    const { resubmissionRequired } =
      await env.reportsRepository.findReportById(reportId)

    const { outcomes, failures } = await reevaluate(env)

    expect(outcomes).toEqual([
      {
        organisationId: env.organisationId,
        registrationId: env.registrationId,
        reportId,
        submissionNumber: 1,
        period: JANUARY_2025,
        flaggedAt: resubmissionRequired?.closedPeriodRestated?.uploadedAt,
        flaggedBy: 'sl-nonfigure',
        verdict: 'would-clear'
      }
    ])
    expect(failures).toEqual([])
  })

  it('ignores a report flagged only by an operator request', async () => {
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
    const { resubmissionRequired } =
      await env.reportsRepository.findReportById(reportId)
    expect(resubmissionRequired?.operatorRequested).toBeDefined()

    const { outcomes, failures } = await reevaluate(env)

    expect(outcomes).toEqual([])
    expect(failures).toEqual([])
  })

  it('ignores a flagged submission that has since been resubmitted', async () => {
    const env = await setupEnvironment()
    const firstId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )
    const { resubmissionRequired } =
      await env.reportsRepository.findReportById(firstId)
    expect(resubmissionRequired?.closedPeriodRestated).toBeDefined()
    await generateAndSubmitReport(env, JANUARY_2025, 2)

    const { outcomes, failures } = await reevaluate(env)

    expect(outcomes).toEqual([])
    expect(failures).toEqual([])
  })

  it('records a failure when the ledger of the summary log that set the flag holds no submission', async () => {
    const env = await setupEnvironment()
    const reportId = await submitAndCloseJanuary(env)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      AMENDED_REFERENCE
    )
    vi.spyOn(
      env.ledgerRepository,
      'findLatestInLedgerByKind'
    ).mockResolvedValue(null)

    const { outcomes, failures } = await reevaluate(env)

    expect(outcomes).toEqual([])
    expect(failures).toEqual([
      {
        reportId,
        error:
          'No submission on the ledger of summary log sl-nonfigure, which set the flag'
      }
    ])
  })

  it('records a report it fails to evaluate and carries on with the rest', async () => {
    const env = await setupEnvironment()
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
    const januaryId = await generateAndSubmitReport(env, JANUARY_2025)
    const februaryId = await generateAndSubmitReport(env, FEBRUARY_2025)
    await uploadAndSubmitFlaggingEveryClosedPeriod(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      [
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-JAN-2' },
        {
          rowId: 1002,
          tonnageReceived: 200,
          dateReceived: FEBRUARY_DATE,
          yourReference: 'REF-FEB-2'
        }
      ]
    )
    vi.spyOn(env.reportsRepository, 'findReportById').mockRejectedValueOnce(
      new Error('reports store unavailable')
    )

    const { outcomes, failures } = await reevaluate(env)

    expect(failures).toEqual([
      { reportId: expect.any(String), error: 'reports store unavailable' }
    ])
    expect(outcomes).toEqual([
      expect.objectContaining({ verdict: 'would-clear' })
    ])
    expect([failures[0].reportId, outcomes[0].reportId].sort()).toEqual(
      [januaryId, februaryId].sort()
    )
  })

  describe('verdict', () => {
    it('keeps a flag the operator has also asked to resubmit, without comparing figures', async () => {
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
        'sl-figure',
        'file-figure',
        CHANGED_TONNAGE
      )

      const { outcomes } = await reevaluate(env)

      expect(outcomes).toEqual([
        expect.objectContaining({
          reportId,
          verdict: 'kept',
          reason: 'operator-requested'
        })
      ])
      expect(outcomes[0]).not.toHaveProperty('changedFields')
    })

    it('keeps a flag whose resubmission is already in draft, without comparing figures', async () => {
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
        expect.objectContaining({
          reportId,
          verdict: 'kept',
          reason: 'resubmission-in-progress'
        })
      ])
      expect(outcomes[0]).not.toHaveProperty('changedFields')
    })

    it('keeps a flag whose reported figures changed, naming the fields', async () => {
      const env = await setupEnvironment()
      const reportId = await submitAndCloseJanuary(env)
      await uploadAndSubmitFlaggingEveryClosedPeriod(
        env,
        'sl-figure',
        'file-figure',
        CHANGED_TONNAGE
      )

      const { outcomes } = await reevaluate(env)

      expect(outcomes).toEqual([
        expect.objectContaining({
          reportId,
          verdict: 'kept',
          reason: 'figures-changed',
          changedFields: expect.arrayContaining([
            'recyclingActivity.totalTonnageReceived'
          ])
        })
      ])
    })

    it('keeps a flag whose figures changed in an earlier upload than the one that last set it', async () => {
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

      const { outcomes } = await reevaluate(env)

      expect(outcomes).toEqual([
        expect.objectContaining({
          reportId,
          flaggedBy: 'sl-nonfigure',
          verdict: 'kept',
          reason: 'figures-changed'
        })
      ])
    })

    it('compares against the latest submission, not the upload that set the flag', async () => {
      const env = await setupEnvironment()
      const reportId = await submitAndCloseJanuary(env)
      await uploadAndSubmitFlaggingEveryClosedPeriod(
        env,
        'sl-figure',
        'file-figure',
        CHANGED_TONNAGE
      )
      await upload(
        env,
        'sl-reverted',
        'file-reverted',
        reprocessorFile(FIRST_UPLOAD)
      )
      await submit(env, 'sl-reverted')

      const { outcomes } = await reevaluate(env)

      expect(outcomes).toEqual([
        expect.objectContaining({
          reportId,
          flaggedBy: 'sl-figure',
          verdict: 'would-clear'
        })
      ])
    })

    it('evaluates a registered-only registration on its own ledger', async () => {
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
        registeredOnlyExporterFile({
          osrName: 'Site B',
          osrCountry: 'France-FR'
        })
      )

      const { outcomes, failures } = await reevaluate(env)

      expect(outcomes).toEqual([
        expect.objectContaining({
          reportId,
          period: Q1_2025,
          verdict: 'would-clear'
        })
      ])
      expect(failures).toEqual([])
    })

    describe('keeps a flag it cannot compare', () => {
      const flagWithoutFigureChange = async (env) => {
        const reportId = await submitAndCloseJanuary(env)
        await uploadAndSubmitFlaggingEveryClosedPeriod(
          env,
          'sl-nonfigure',
          'file-nonfigure',
          AMENDED_REFERENCE
        )
        return reportId
      }

      const withStoredReport = (env, change) => {
        const findReportById = env.reportsRepository.findReportById
        vi.spyOn(env.reportsRepository, 'findReportById').mockImplementation(
          async (reportId) => change(await findReportById(reportId))
        )
      }

      it('when the summary log that set the flag no longer exists', async () => {
        const env = await setupEnvironment()
        const reportId = await flagWithoutFigureChange(env)
        vi.spyOn(env.summaryLogsRepository, 'findById').mockResolvedValue(null)

        const { outcomes } = await reevaluate(env)

        expect(outcomes).toEqual([
          expect.objectContaining({
            reportId,
            verdict: 'kept',
            reason: 'cannot-compare',
            detail: 'the summary log that set the flag no longer exists'
          })
        ])
      })

      it('when its report records no source', async () => {
        const env = await setupEnvironment()
        const reportId = await flagWithoutFigureChange(env)
        withStoredReport(env, ({ source: _source, ...report }) => report)

        const { outcomes } = await reevaluate(env)

        expect(outcomes).toEqual([
          expect.objectContaining({
            reportId,
            verdict: 'kept',
            reason: 'cannot-compare',
            detail: 'its report records no source'
          })
        ])
      })

      it('when its source submission has no row states', async () => {
        const env = await setupEnvironment()
        const reportId = await flagWithoutFigureChange(env)
        withStoredReport(env, (report) => ({
          ...report,
          source: { ...report.source, summaryLogId: 'file-without-row-states' }
        }))

        const { outcomes } = await reevaluate(env)

        expect(outcomes).toEqual([
          expect.objectContaining({
            reportId,
            verdict: 'kept',
            reason: 'cannot-compare',
            detail: 'its source submission has no row states'
          })
        ])
      })
    })
  })
})
