import { http, HttpResponse } from 'msw'
import { ObjectId } from 'mongodb'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import { createReportForPeriod } from '#reports/application/report-service.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import {
  buildAccreditation,
  buildAwaitingAcceptancePrn
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

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
} from './integration-test-helpers.js'

// Data tables start with their header at row 7, so data rows begin at row 8.
const TABLE_HEADER_ROW = 7
const FIRST_DATA_ROW = TABLE_HEADER_ROW + 1
const SUBMIT_MAX_POLL_ATTEMPTS = 10

// The accredited org reports monthly, so a January-dated received load closes
// against the January monthly period.
const JANUARY_2025 = {
  year: 2025,
  cadence: 'monthly',
  period: MONTHLY_PERIODS.January
}

const CHANGED_BY = { id: 'u1', name: 'Test User', position: 'Officer' }

describe('periodsRequiringResubmission (figure-gated resubmission)', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

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

  const upload = async (env, summaryLogId, fileId, uploadData) => {
    const { server, fileDataMap, organisationId, registrationId } = env

    fileDataMap[fileId] = { meta, data: uploadData }

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

    await pollForValidation(
      server,
      organisationId,
      registrationId,
      summaryLogId
    )
  }

  const getLoadsByReportingPeriod = async (env, summaryLogId) => {
    const response = await env.server.inject({
      method: 'GET',
      url: buildGetUrl(env.organisationId, env.registrationId, summaryLogId),
      ...asOperator()
    })
    return JSON.parse(response.payload).loadsByReportingPeriod
  }

  const uploadAndValidate = async (env, summaryLogId, fileId, uploadData) => {
    await upload(env, summaryLogId, fileId, uploadData)
    return getLoadsByReportingPeriod(env, summaryLogId)
  }

  const submitAndPoll = async (env, summaryLogId) => {
    const { server, organisationId, registrationId } = env

    await server.inject({
      method: 'POST',
      url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    await pollWhileStatus(
      server,
      organisationId,
      registrationId,
      summaryLogId,
      {
        waitWhile: SUMMARY_LOG_STATUS.SUBMITTING,
        maxAttempts: SUBMIT_MAX_POLL_ATTEMPTS
      }
    )
  }

  // Generates the period's report from the just-submitted head via the real
  // report path, then advances it to submitted so the period closes with the
  // exact frozen figures the head produces. This is the before-state the
  // figure-diff compares against.
  const generateAndSubmitReport = async (env, { year, cadence, period }) => {
    const registration = await env.organisationsRepository.findRegistrationById(
      env.organisationId,
      env.registrationId
    )

    const report = await createReportForPeriod({
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
      submissionNumber: 1,
      changedBy: CHANGED_BY
    })

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
  }

  // Submits January rows, then closes January from the resulting head, leaving
  // the registration primed for a resubmission upload.
  const submitAndCloseJanuary = async (env) => {
    await upload(env, 'sl-first', 'file-first', createUploadData(FIRST_UPLOAD))
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, JANUARY_2025)
  }

  // Weights are capped at 1000 in the reprocessor received template
  // (grossWeight = tonnage + 150), so tonnages stay well under that.
  const FIRST_UPLOAD = [
    { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-ORIGINAL' }
  ]

  it('does not flag a closed period when only a non-figure field changed', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })
    await submitAndCloseJanuary(env)

    // Same figures, only the non-figure free-text reference changes: the row is
    // an adjustment touching closed January, but its reported figures are
    // identical.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-nonfigure',
      'file-nonfigure',
      createUploadData([
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-AMENDED' }
      ])
    )

    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
    // Display and closed-period detection remain intact (AC3 regression).
    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(
      loadsByReportingPeriod.closedPeriodLoads.adjusted.nonBalanceAffecting
        .count
    ).toBe(1)
  })

  it('flags a closed period when a reported figure changed', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })
    await submitAndCloseJanuary(env)

    // The received tonnage changes, so the reported figures differ.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-figure',
      'file-figure',
      createUploadData([
        { rowId: 1001, tonnageReceived: 500, bailingWire: 'No' }
      ])
    )

    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([
      JANUARY_2025
    ])
    // The closed-period display still reflects the balance-affecting adjustment.
    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(
      loadsByReportingPeriod.closedPeriodLoads.adjusted.balanceAffecting.count
    ).toBe(1)
  })

  it('flags a closed period when PRN issued tonnage drifted since submission', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })
    // Close January while no PRNs exist, so the frozen report carries zero
    // issued tonnage.
    await submitAndCloseJanuary(env)

    // A PRN is now issued in January, after the report was frozen.
    const prn = buildAwaitingAcceptancePrn({
      organisation: { id: env.organisationId, name: 'Test Organisation' },
      registrationId: env.registrationId,
      accreditation: buildAccreditation({ id: env.accreditationId }),
      tonnage: 50
    })
    prn.status.issued = {
      at: new Date('2025-01-20T00:00:00.000Z'),
      by: { id: 'issuer', name: 'Issuer', position: 'Manager' }
    }
    await env.packagingRecyclingNotesRepository.create(prn)

    // Only a non-figure summary-log edit, so the summary-log figures are
    // unchanged, but the freshly generated issued tonnage now differs.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-prn',
      'file-prn',
      createUploadData([
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-AMENDED' }
      ])
    )

    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([
      JANUARY_2025
    ])
  })

  it('does not flag when identical figures are uploaded with rows reordered', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })

    await upload(
      env,
      'sl-first',
      'file-first',
      createUploadData([
        { rowId: 1001, supplierName: 'Supplier A', tonnageReceived: 100 },
        { rowId: 1002, supplierName: 'Supplier B', tonnageReceived: 200 }
      ])
    )
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, JANUARY_2025)

    // Each row swaps which supplier and tonnage it carries: both rows adjust,
    // but the aggregated supplier set is identical, only reordered.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-reordered',
      'file-reordered',
      createUploadData([
        { rowId: 1001, supplierName: 'Supplier B', tonnageReceived: 200 },
        { rowId: 1002, supplierName: 'Supplier A', tonnageReceived: 100 }
      ])
    )

    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
  })
})
