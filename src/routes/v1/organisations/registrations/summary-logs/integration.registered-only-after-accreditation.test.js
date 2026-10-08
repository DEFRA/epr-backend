import { StatusCodes } from 'http-status-codes'

import { calendarDate } from '#common/helpers/date-formatter.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { QUARTERLY_PERIODS } from '#reports/domain/period-labels.js'
import { createAndSubmitReport } from '#reports/repository/contract/test-data.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
  createUploadPayload,
  pollForValidation,
  pollWhileStatus,
  setupWasteBalanceIntegrationEnvironment
} from './integration-test-helpers.js'

const YEAR = 2025
const TABLE_HEADER_ROW = 7
const FIRST_DATA_ROW = TABLE_HEADER_ROW + 1

const registeredOnlyMeta = {
  REGISTRATION_NUMBER: {
    value: 'REG-123',
    location: { sheet: 'Cover', row: 1, column: 'B' }
  },
  PROCESSING_TYPE: {
    value: 'REPROCESSOR_REGISTERED_ONLY',
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

/** @param {{ rowId: number, month: string }[]} rows */
const receivedLoads = (rows) => ({
  RECEIVED_LOADS_FOR_REPROCESSING: {
    location: { sheet: 'Received', row: TABLE_HEADER_ROW, column: 'A' },
    headers: [
      'ROW_ID',
      'MONTH_RECEIVED_FOR_REPROCESSING',
      'NET_WEIGHT',
      'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
      'RECYCLABLE_PROPORTION_PERCENTAGE',
      'TONNAGE_RECEIVED_FOR_RECYCLING',
      'SUPPLIER_NAME',
      'SUPPLIER_ADDRESS',
      'SUPPLIER_POSTCODE',
      'SUPPLIER_EMAIL',
      'SUPPLIER_PHONE_NUMBER',
      'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER'
    ],
    rows: rows.map(({ rowId, month }, index) => ({
      rowNumber: FIRST_DATA_ROW + index,
      values: [
        rowId,
        month,
        10.5,
        'Actual weight (100%)',
        0.95,
        9.975,
        'Supplier Co',
        '1 High St',
        'SW1A 1AA',
        'supplier@example.com',
        '01234567',
        'Sorting'
      ]
    }))
  }
})

describe('an operator accredited in July uploading their registered-only summary log for January to June', () => {
  setupAuthContext()

  it('validates and submits it as registered-only, reporting by quarter', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      accreditationValidFrom: `${YEAR}-07-01`
    })
    const { server, organisationId, registrationId } = env
    const { orgId } = await env.organisationsRepository.findById(organisationId)
    const registration = `/organisations/${orgId}/registrations/REG-123`

    // Close Q1, so the quarterly split shows: January to March closed,
    // April to June open.
    await createAndSubmitReport(env.reportsRepository, {
      organisationId,
      registrationId,
      year: YEAR,
      cadence: CADENCE.quarterly,
      period: QUARTERLY_PERIODS.Q1,
      startDate: calendarDate(`${YEAR}-01-01`),
      endDate: calendarDate(`${YEAR}-03-31`),
      dueDate: calendarDate(`${YEAR}-05-20`)
    })

    const created = await server.inject({
      method: 'POST',
      url: `${registration}/summary-logs/${YEAR}`,
      payload: { redirectUrl: 'https://frontend.test/redirect' },
      ...asOperator()
    })
    expect(created.statusCode).toBe(StatusCodes.CREATED)
    const { summaryLogId } = JSON.parse(created.payload)

    const fileId = 'file-january-to-june'
    env.fileDataMap[fileId] = {
      meta: registeredOnlyMeta,
      data: receivedLoads([
        { rowId: 1001, month: `${YEAR}-01-01` },
        { rowId: 1002, month: `${YEAR}-06-01` }
      ])
    }
    await server.inject({
      method: 'POST',
      url: `${registration}/summary-logs/${YEAR}/${summaryLogId}/upload-completed`,
      payload: createUploadPayload(
        organisationId,
        registrationId,
        UPLOAD_STATUS.COMPLETE,
        fileId,
        'january-to-june.xlsx'
      )
    })
    await pollForValidation(
      server,
      organisationId,
      registrationId,
      summaryLogId
    )

    const { summaryLog: validated } = await waitForVersion(
      env.summaryLogsRepository,
      summaryLogId,
      2
    )
    expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    expect(validated.accreditationId).toBeNull()
    expect(validated.loadsByReportingPeriod.closedPeriods).toEqual([
      { year: YEAR, cadence: CADENCE.quarterly, period: QUARTERLY_PERIODS.Q1 }
    ])
    expect(
      validated.loadsByReportingPeriod.closedPeriodLoads.added
        .nonBalanceAffecting.count
    ).toBe(1)
    expect(
      validated.loadsByReportingPeriod.openPeriodLoads.added.nonBalanceAffecting
        .count
    ).toBe(1)

    const submitted = await server.inject({
      method: 'POST',
      url: `${registration}/summary-logs/${summaryLogId}/submit`,
      ...asOperator()
    })
    expect(submitted.statusCode).toBe(StatusCodes.OK)
    await pollWhileStatus(
      server,
      organisationId,
      registrationId,
      summaryLogId,
      {
        waitWhile: SUMMARY_LOG_STATUS.SUBMITTING
      }
    )

    const submittedEvent = await env.ledgerRepository.findLatestInLedgerByKind(
      { organisationId, registrationId, accreditationId: null },
      LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
    )
    expect(submittedEvent).toMatchObject({
      accreditationId: null,
      payload: { summaryLogId: fileId }
    })
  })
})
