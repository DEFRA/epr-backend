import { http, HttpResponse } from 'msw'
import { ObjectId } from 'mongodb'
import { onTestFinished, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import {
  MONTHLY_PERIODS,
  QUARTERLY_PERIODS
} from '#reports/domain/period-labels.js'
import { createReportForPeriod } from '#reports/application/report-service.js'
import { requestOperatorResubmission } from '#reports/application/resubmission-service.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createExporterRowValues,
  createReprocessorReceivedRowValues,
  createReprocessorSentOnRowValues,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  pollForValidation,
  pollWhileStatus,
  REPROCESSOR_RECEIVED_HEADERS,
  REPROCESSOR_SENT_ON_HEADERS,
  setupWasteBalanceIntegrationEnvironment,
  TEST_OVERSEAS_SITE_ID
} from './integration-test-helpers.js'

/**
 * @typedef {Record<string, { value: unknown, location: { sheet: string, row: number, column: string } }>} SummaryLogMeta
 */

// Data tables start with their header at row 7, so data rows begin at row 8.
const TABLE_HEADER_ROW = 7
const FIRST_DATA_ROW = TABLE_HEADER_ROW + 1
const SUBMIT_MAX_POLL_ATTEMPTS = 10

// The accredited org reports monthly, so a January-dated received load closes
// against the January monthly period.
const JANUARY_2025 = {
  year: 2025,
  cadence: /** @type {const} */ ('monthly'),
  period: MONTHLY_PERIODS.January
}

const FEBRUARY_2025 = {
  year: 2025,
  cadence: 'monthly',
  period: MONTHLY_PERIODS.February
}
const FEBRUARY_DATE = '2025-02-15T00:00:00.000Z'

// A registered-only operator has no accreditation, so it reports quarterly; a
// January-dated export closes against Q1.
const Q1_2025 = {
  year: 2025,
  cadence: 'quarterly',
  period: QUARTERLY_PERIODS.Q1
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
  const sentOnMeta = createWasteBalanceMeta('REPROCESSOR_OUTPUT')
  const exporterMeta = /** @type {SummaryLogMeta} */ (
    createWasteBalanceMeta('EXPORTER')
  )

  const createExporterUploadData = (rows) => ({
    RECEIVED_LOADS_FOR_EXPORT: {
      location: { sheet: 'Received', row: TABLE_HEADER_ROW, column: 'A' },
      headers: EXPORTER_HEADERS,
      rows: rows.map((row, index) => ({
        rowNumber: FIRST_DATA_ROW + index,
        values: createExporterRowValues(row)
      }))
    }
  })

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

  const createSentOnUploadData = (rows) => ({
    SENT_ON_LOADS: {
      location: { sheet: 'Sent on', row: TABLE_HEADER_ROW, column: 'A' },
      headers: REPROCESSOR_SENT_ON_HEADERS,
      rows: rows.map((row, index) => ({
        rowNumber: FIRST_DATA_ROW + index,
        values: createReprocessorSentOnRowValues(row)
      }))
    }
  })

  // Registered-only exporter meta (no accreditation number, quarterly cadence).
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
  const createLoadsExportedUploadData = ({ osrName, osrCountry }) => ({
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
  })

  const upload = async (
    env,
    summaryLogId,
    fileId,
    uploadData,
    uploadMeta = /** @type {SummaryLogMeta} */ (meta)
  ) => {
    const { server, fileDataMap, organisationId, registrationId } = env

    fileDataMap[fileId] = { meta: uploadMeta, data: uploadData }

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

  const uploadAndValidate = async (
    env,
    summaryLogId,
    fileId,
    uploadData,
    uploadMeta = /** @type {SummaryLogMeta} */ (meta)
  ) => {
    await upload(env, summaryLogId, fileId, uploadData, uploadMeta)
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
  // report path, leaving it in progress.
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

  // Generates the period's report, then advances it to submitted so the period
  // closes with the exact frozen figures the head produces. This is the
  // before-state the figure-diff compares against.
  const generateAndSubmitReport = async (env, period) => {
    const report = await generateReport(env, period)

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

  // Same as submitAndCloseJanuary but seeds the closed period from Sent on loads
  // (reprocessor output), so the report's source submission carries
  // wasteSent.finalDestinations to diff against.
  const submitAndCloseJanuaryWithSentOn = async (env, rows) => {
    await upload(
      env,
      'sl-first',
      'file-first',
      createSentOnUploadData(rows),
      sentOnMeta
    )
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, JANUARY_2025)
  }

  // Captures log messages at a level from here to the end of the test, so a
  // test can assert what the gate recorded about each closed period.
  const captureMessages = (/** @type {'info' | 'error'} */ level) => {
    const spy = vi.spyOn(logger, level).mockImplementation(() => {})
    onTestFinished(() => spy.mockRestore())
    return () =>
      spy.mock.calls.map(
        ([entry]) => /** @type {{ message?: string }} */ (entry).message
      )
  }
  const captureInfoMessages = () => captureMessages('info')

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

  it('flags only the closed period whose reported figures changed', async () => {
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
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-JAN' },
        {
          rowId: 1002,
          tonnageReceived: 200,
          dateReceived: FEBRUARY_DATE,
          yourReference: 'REF-FEB'
        }
      ])
    )
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, JANUARY_2025)
    await generateAndSubmitReport(env, FEBRUARY_2025)

    // Both rows adjust, so both closed periods are restated, but only
    // February's reported figures change.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-both',
      'file-both',
      createUploadData([
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-JAN-AMENDED' },
        { rowId: 1002, tonnageReceived: 250, dateReceived: FEBRUARY_DATE }
      ])
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([
      JANUARY_2025,
      FEBRUARY_2025
    ])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([
      FEBRUARY_2025
    ])
  })

  it('does not flag a closed period when a contact detail changed on one of several rows for the same supplier', async () => {
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
        { rowId: 1002, supplierName: 'Supplier A', tonnageReceived: 200 }
      ])
    )
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, JANUARY_2025)

    // The aggregation now splits Supplier A into two entries (the phone number
    // differs), but the report presents the same supplier and tonnage.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-split',
      'file-split',
      createUploadData([
        { rowId: 1001, supplierName: 'Supplier A', tonnageReceived: 100 },
        {
          rowId: 1002,
          supplierName: 'Supplier A',
          supplierPhone: '0000000000',
          tonnageReceived: 200
        }
      ])
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
  })

  it('does not flag a closed period that holds loads outside the accreditation window when nothing reported changed', async () => {
    // The accreditation opens partway through January, so a load dated before
    // then is outside it, yet still in January and in January's report.
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      accreditationValidFrom: '2025-01-10',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })

    const rowOutsideAccreditation = {
      rowId: 1002,
      tonnageReceived: 50,
      dateReceived: '2025-01-05T00:00:00.000Z'
    }
    await upload(
      env,
      'sl-first',
      'file-first',
      createUploadData([...FIRST_UPLOAD, rowOutsideAccreditation])
    )
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, JANUARY_2025)

    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-window',
      'file-window',
      createUploadData([
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-AMENDED' },
        rowOutsideAccreditation
      ])
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
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

  it('does not flag a closed period when only supplier email and phone changed', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })
    await submitAndCloseJanuary(env)

    // Supplier telephone and email are stored on the report, but by agreement a
    // change to them alone is not a reported-data change. Name, address and
    // tonnage are unchanged, so the report is identical.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-contact',
      'file-contact',
      createUploadData([
        {
          rowId: 1001,
          tonnageReceived: 100,
          supplierEmail: 'changed@example.com',
          supplierPhone: '0000000000'
        }
      ])
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
  })

  it('does not flag a closed period when a supplier name differs only by casing and whitespace', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })
    await submitAndCloseJanuary(env)

    // The frozen report's supplier name is 'Supplier A'. Re-uploading it with
    // different casing and internal whitespace is not a reported-data change.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-casing',
      'file-casing',
      createUploadData([
        { rowId: 1001, tonnageReceived: 100, supplierName: 'SUPPLIER  A' }
      ])
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
  })

  it('flags a closed period when a final destination name changed', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      reprocessingType: 'output',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })
    await submitAndCloseJanuaryWithSentOn(env, [
      { rowId: 5001, tonnageSent: 100, destinationName: 'Dest A' }
    ])

    // The final destination name is reported data (stored on the report), so
    // changing it changes the report.
    const infoMessages = captureInfoMessages()
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-dest-name',
      'file-dest-name',
      createSentOnUploadData([
        { rowId: 5001, tonnageSent: 100, destinationName: 'Dest B' }
      ]),
      sentOnMeta
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([
      JANUARY_2025
    ])
    // The gate records which reported fields changed (paths only, no values),
    // against the upload that changed them.
    expect(infoMessages()).toContainEqual(
      expect.stringContaining(
        '(summary log sl-dest-name) requires resubmission: reported data changed in wasteSent.finalDestinations'
      )
    )
  })

  it('does not flag a closed period when only final destination email and phone changed', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      reprocessingType: 'output',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })
    await submitAndCloseJanuaryWithSentOn(env, [
      { rowId: 5001, tonnageSent: 100, destinationName: 'Dest A' }
    ])

    // Final destination email and phone are captured on the sheet but never
    // reach the report, so a change to them alone is not a reported-data change.
    const infoMessages = captureInfoMessages()
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-dest-contact',
      'file-dest-contact',
      createSentOnUploadData([
        {
          rowId: 5001,
          tonnageSent: 100,
          destinationName: 'Dest A',
          destinationEmail: 'changed@example.com',
          destinationPhone: '0000000000'
        }
      ]),
      sentOnMeta
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
    expect(infoMessages()).toContainEqual(
      expect.stringContaining(
        '(summary log sl-dest-contact) does not require resubmission: reported data unchanged'
      )
    )
  })

  it('does not flag a closed period when only OSR name and country changed (registered-only exporter)', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      accredited: false,
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })

    await upload(
      env,
      'sl-first',
      'file-first',
      createLoadsExportedUploadData({
        osrName: 'Site A',
        osrCountry: 'Vietnam-VN'
      }),
      registeredOnlyExporterMeta
    )
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, Q1_2025)

    // OSR name and country are resolved from the ORS registry by OSR_ID, so the
    // sheet cells are pass-through: changing them does not change the report.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-osr',
      'file-osr',
      createLoadsExportedUploadData({
        osrName: 'Site B',
        osrCountry: 'France-FR'
      }),
      registeredOnlyExporterMeta
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([Q1_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
  })

  it('does not flag a closed period when the registry renames the site (excluded registry fields)', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      accredited: false,
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })

    await upload(
      env,
      'sl-first',
      'file-first',
      createLoadsExportedUploadData({
        osrName: 'Site A',
        osrCountry: 'Vietnam-VN'
      }),
      registeredOnlyExporterMeta
    )
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, Q1_2025)

    // After Q1 closed, the ORS registry renames the site. Site name and country
    // are excluded from the comparison, so a rename never reaches the diff.
    await env.overseasSitesRepository.update(TEST_OVERSEAS_SITE_ID, {
      name: 'Renamed Overseas Site'
    })

    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-after-rename',
      'file-after-rename',
      createLoadsExportedUploadData({
        osrName: 'Site B',
        osrCountry: 'Vietnam-VN'
      }),
      registeredOnlyExporterMeta
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([Q1_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
  })

  it('does not flag a closed period when the registry stops resolving the site after it closed', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })

    await upload(
      env,
      'sl-first',
      'file-first',
      createExporterUploadData([{ rowId: 1001 }]),
      exporterMeta
    )
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, JANUARY_2025)

    // After January closed, the site leaves the registry, so its tonnage moves
    // from overseasSites to unapprovedOverseasSites. Both lists are compared, so
    // this would read as a change against the stored report; rebuilt with
    // today's registry on both sides, the upload changes nothing.
    await env.overseasSitesRepository.remove(TEST_OVERSEAS_SITE_ID)

    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-after-removal',
      'file-after-removal',
      createExporterUploadData([{ rowId: 1001, yourReference: 'REF-AMENDED' }]),
      exporterMeta
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([])
  })

  it('compares against the latest submitted report, not a resubmission draft', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })
    await submitAndCloseJanuary(env)

    // A later submission changes January's tonnage, and the operator starts
    // resubmitting January from it: submission 2 is in progress, so the
    // regulator still holds submission 1 (100 tonnes).
    await upload(
      env,
      'sl-second',
      'file-second',
      createUploadData([
        { rowId: 1001, tonnageReceived: 500, bailingWire: 'No' }
      ])
    )
    await submitAndPoll(env, 'sl-second')
    await requestOperatorResubmission({
      reportsRepository: env.reportsRepository,
      organisationId: env.organisationId,
      registrationId: env.registrationId,
      ...JANUARY_2025,
      submissionNumber: 1,
      requestedBy: CHANGED_BY
    })
    await generateReport(env, JANUARY_2025, 2)

    // Matches the draft's figures, but not the submitted report's.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-third',
      'file-third',
      createUploadData([
        {
          rowId: 1001,
          tonnageReceived: 500,
          bailingWire: 'No',
          yourReference: 'REF-THIRD'
        }
      ])
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([JANUARY_2025])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([
      JANUARY_2025
    ])
  })

  it('flags a closed period it cannot compare because the source submission has no row states', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })
    await submitAndCloseJanuary(env)

    // The stored report names a source submission with no row states, as a
    // report generated before row states were recorded would.
    const findReportById = env.reportsRepository.findReportById
    vi.spyOn(env.reportsRepository, 'findReportById').mockImplementation(
      async (reportId) => {
        const report = await findReportById(reportId)
        return {
          ...report,
          source: {
            summaryLogId: 'sl-without-row-states',
            lastUploadedAt: report.source?.lastUploadedAt ?? null
          }
        }
      }
    )

    const infoMessages = captureInfoMessages()
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-no-source',
      'file-no-source',
      createUploadData([
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-AMENDED' }
      ])
    )

    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([
      JANUARY_2025
    ])
    expect(infoMessages()).toContainEqual(
      expect.stringContaining(
        '(summary log sl-no-source) requires resubmission: cannot compare, its source submission has no row states'
      )
    )
  })

  it('flags only the period whose comparison failed, and still validates the upload', async () => {
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
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-JAN' },
        {
          rowId: 1002,
          tonnageReceived: 200,
          dateReceived: FEBRUARY_DATE,
          yourReference: 'REF-FEB'
        }
      ])
    )
    await submitAndPoll(env, 'sl-first')
    await generateAndSubmitReport(env, JANUARY_2025)
    await generateAndSubmitReport(env, FEBRUARY_2025)

    const findReportById = env.reportsRepository.findReportById
    vi.spyOn(env.reportsRepository, 'findReportById').mockImplementation(
      async (reportId) => {
        const report = await findReportById(reportId)
        if (report.period === JANUARY_2025.period) {
          throw new Error('reports store unavailable')
        }
        return report
      }
    )

    const infoMessages = captureInfoMessages()
    const errorMessages = captureMessages('error')
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-period-error',
      'file-period-error',
      createUploadData([
        { rowId: 1001, tonnageReceived: 100, yourReference: 'REF-JAN-2' },
        {
          rowId: 1002,
          tonnageReceived: 200,
          dateReceived: FEBRUARY_DATE,
          yourReference: 'REF-FEB-2'
        }
      ])
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([
      JANUARY_2025,
      FEBRUARY_2025
    ])
    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([
      JANUARY_2025
    ])
    expect(errorMessages()).toContainEqual(
      expect.stringMatching(
        /Closed period 2025 monthly 1 .*\(summary log sl-period-error\) requires resubmission: comparison failed/
      )
    )
    expect(infoMessages()).toContainEqual(
      expect.stringMatching(
        /Closed period 2025 monthly 2 .* does not require resubmission/
      )
    )
  })

  it('compares against an empty before-state when the report predates any submission', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    })

    // January is reported and submitted before any summary log, so its report
    // has no source submission.
    await generateAndSubmitReport(env, JANUARY_2025)

    const infoMessages = captureInfoMessages()
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-first-upload',
      'file-first-upload',
      createUploadData(FIRST_UPLOAD)
    )

    expect(loadsByReportingPeriod.periodsRequiringResubmission).toEqual([
      JANUARY_2025
    ])
    expect(infoMessages()).toContainEqual(
      expect.stringContaining(
        '(summary log sl-first-upload) requires resubmission: reported data changed in'
      )
    )
  })
})
