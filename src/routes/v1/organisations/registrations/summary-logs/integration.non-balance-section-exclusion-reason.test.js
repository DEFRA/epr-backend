import { http, HttpResponse } from 'msw'

import { UPLOAD_STATUS } from '#domain/summary-logs/status.js'
import { CLASSIFICATION_REASON } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
  buildGetUrl,
  buildPostUrl,
  createReprocessorReceivedRowValues,
  createReprocessorSentOnRowValues,
  createUploadPayload,
  createWasteBalanceMeta,
  pollForValidation,
  REPROCESSOR_RECEIVED_HEADERS,
  REPROCESSOR_SENT_ON_HEADERS,
  setupWasteBalanceIntegrationEnvironment
} from './integration-test-helpers.js'

// The reprocessor-input Processed sheet has its own all-optional columns,
// distinct from the reprocessor-output Processed sheet, so it needs a bespoke
// header list and row rather than the shared reprocessed-loads helper.
const REPROCESSOR_INPUT_PROCESSED_HEADERS = [
  'ROW_ID',
  'DATE_LOAD_LEFT_SITE',
  'PRODUCT_DESCRIPTION',
  'END_OF_WASTE_STANDARDS',
  'PRODUCT_TONNAGE',
  'WEIGHBRIDGE_TICKET_NUMBER',
  'HAULIER_NAME',
  'HAULIER_VEHICLE_REGISTRATION_NUMBER',
  'CUSTOMER_NAME',
  'CUSTOMER_INVOICE_REFERENCE'
]

const createReprocessorInputProcessedRowValues = (rowId) => [
  rowId,
  '2025-01-15T00:00:00.000Z',
  'Recycled product',
  'Yes',
  100,
  'WB-1',
  'Haulier A',
  'AB12 CDE',
  'Customer A',
  'INV-1'
]

// Data tables start with their header at row 7, so data rows begin at row 8.
const TABLE_HEADER_ROW = 7
const FIRST_DATA_ROW = TABLE_HEADER_ROW + 1

// A single-row table upload keyed by its schema table name. The sheet name and
// headers identify which template section the row belongs to.
const singleRowTable = (tableName, sheet, headers, values) => ({
  [tableName]: {
    location: { sheet, row: TABLE_HEADER_ROW, column: 'A' },
    headers,
    rows: [{ rowNumber: FIRST_DATA_ROW, values }]
  }
})

describe('by-design non-waste-balance sections carry an explicit exclusion reason', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  const uploadAndGetLoads = async (env, summaryLogId, fileId, meta, data) => {
    const { server, fileDataMap, organisationId, registrationId } = env

    fileDataMap[fileId] = { meta, data }

    await server.inject({
      method: 'POST',
      url: buildPostUrl(organisationId, registrationId, summaryLogId),
      payload: createUploadPayload(
        organisationId,
        registrationId,
        UPLOAD_STATUS.COMPLETE,
        fileId,
        'waste-data.xlsx'
      )
    })

    await pollForValidation(
      server,
      organisationId,
      registrationId,
      summaryLogId
    )

    const response = await server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    return JSON.parse(response.payload).loadsByReportingPeriod
  }

  // Every by-design section maps a single open-period row to the same shape:
  // a nonBalanceAffecting row whose only exclusion reason is the new code.
  const expectByDesignRow = (loads, { rowId, wasteRecordType }) => {
    expect(loads.openPeriodLoads.added.nonBalanceAffecting).toEqual({
      count: 1,
      rows: [
        {
          rowId,
          wasteRecordType,
          exclusionReasons: [
            CLASSIFICATION_REASON.TEMPLATE_SECTION_DOES_NOT_CONTRIBUTE_TO_WASTE_BALANCE
          ],
          tonnageDelta: 0
        }
      ]
    })
    expect(loads.openPeriodLoads.added.balanceAffecting.count).toBe(0)
  }

  it('flags a reprocessor-input Processed row (REPROCESSED_LOADS)', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      reprocessingType: 'input'
    })

    const loads = await uploadAndGetLoads(
      env,
      'sl-input-processed',
      'file-input-processed',
      createWasteBalanceMeta('REPROCESSOR_INPUT'),
      singleRowTable(
        'REPROCESSED_LOADS',
        'Processed',
        REPROCESSOR_INPUT_PROCESSED_HEADERS,
        createReprocessorInputProcessedRowValues(4001)
      )
    )

    expectByDesignRow(loads, {
      rowId: '4001',
      wasteRecordType: WASTE_RECORD_TYPE.PROCESSED
    })
  })

  it('flags a reprocessor-output Received row (RECEIVED_LOADS_FOR_REPROCESSING)', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      reprocessingType: 'output'
    })

    const loads = await uploadAndGetLoads(
      env,
      'sl-output-received',
      'file-output-received',
      createWasteBalanceMeta('REPROCESSOR_OUTPUT'),
      singleRowTable(
        'RECEIVED_LOADS_FOR_REPROCESSING',
        'Received',
        REPROCESSOR_RECEIVED_HEADERS,
        createReprocessorReceivedRowValues({ rowId: 1001 })
      )
    )

    expectByDesignRow(loads, {
      rowId: '1001',
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED
    })
  })

  it('flags a reprocessor-output Sent on row (SENT_ON_LOADS)', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      reprocessingType: 'output'
    })

    const loads = await uploadAndGetLoads(
      env,
      'sl-output-sent-on',
      'file-output-sent-on',
      createWasteBalanceMeta('REPROCESSOR_OUTPUT'),
      singleRowTable(
        'SENT_ON_LOADS',
        'Sent on',
        REPROCESSOR_SENT_ON_HEADERS,
        createReprocessorSentOnRowValues({ rowId: 5001 })
      )
    )

    expectByDesignRow(loads, {
      rowId: '5001',
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON
    })
  })

  it('flags an exporter Sent on row (SENT_ON_LOADS)', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    const loads = await uploadAndGetLoads(
      env,
      'sl-exporter-sent-on',
      'file-exporter-sent-on',
      createWasteBalanceMeta('EXPORTER'),
      singleRowTable(
        'SENT_ON_LOADS',
        'Sent on',
        REPROCESSOR_SENT_ON_HEADERS,
        createReprocessorSentOnRowValues({ rowId: 4001 })
      )
    )

    expectByDesignRow(loads, {
      rowId: '4001',
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON
    })
  })
})
