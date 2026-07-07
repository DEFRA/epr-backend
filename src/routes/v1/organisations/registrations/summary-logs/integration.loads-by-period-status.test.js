import { http, HttpResponse } from 'msw'
import { ObjectId } from 'mongodb'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import {
  MONTHLY_PERIODS,
  QUARTERLY_PERIODS
} from '#reports/domain/period-labels.js'
import { CLASSIFICATION_REASON } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createAndSubmitReport } from '#reports/repository/contract/test-data.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createExporterRowValues,
  createUploadPayload,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  pollForValidation,
  pollWhileStatus,
  setupWasteBalanceIntegrationEnvironment
} from './integration-test-helpers.js'

// Data tables start with their header at row 7, so data rows begin at row 8.
const TABLE_HEADER_ROW = 7
const FIRST_DATA_ROW = TABLE_HEADER_ROW + 1
const SUBMIT_MAX_POLL_ATTEMPTS = 10

describe('loadsByReportingPeriod population at validate time', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  const sharedMeta = createWasteBalanceMeta('EXPORTER')

  const createUploadData = (rows) => ({
    RECEIVED_LOADS_FOR_EXPORT: {
      location: { sheet: 'Received', row: TABLE_HEADER_ROW, column: 'A' },
      headers: EXPORTER_HEADERS,
      rows: rows.map((row, index) => ({
        rowNumber: FIRST_DATA_ROW + index,
        values: createExporterRowValues(row)
      }))
    }
  })

  const upload = async (
    env,
    summaryLogId,
    fileId,
    uploadData,
    meta = sharedMeta
  ) => {
    const { server, fileDataMap, organisationId, registrationId } = env

    fileDataMap[fileId] = { meta, data: uploadData }

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
  }

  const getLoadsByReportingPeriod = async (env, summaryLogId) => {
    const { server, organisationId, registrationId } = env

    const response = await server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    return JSON.parse(response.payload).loadsByReportingPeriod
  }

  const uploadAndValidate = async (
    env,
    summaryLogId,
    fileId,
    uploadData,
    meta
  ) => {
    await upload(env, summaryLogId, fileId, uploadData, meta)
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

  // Submits a January 2025 monthly report so loads dated in January fall into a
  // closed reporting period. The org is accredited, so its cadence is monthly.
  const closeJanuary2025 = (env) =>
    createAndSubmitReport(env.reportsRepository, {
      organisationId: env.organisationId,
      registrationId: env.registrationId,
      year: 2025,
      cadence: 'monthly',
      period: MONTHLY_PERIODS.January,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-01-31T00:00:00.000Z',
      dueDate: '2025-02-20T00:00:00.000Z'
    })

  const emptyChange = () => ({
    balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
    nonBalanceAffecting: { count: 0, rows: [] }
  })

  it('splits added loads into balanceAffecting and nonBalanceAffecting by ORS approval', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    // All loads export on 2025-01-20 (an open period, since no reports are
    // submitted). Row 100t uses OSR_ID 100, which is approved from 2025-01-01,
    // so it counts toward the predicted waste-balance delta. Row 200t uses
    // OSR_ID 999, which is not in the registration's overseas sites at all, so
    // it is excluded as ORS_NOT_FOUND. Row 300t uses OSR_ID 200, a registered
    // site whose approval starts after the export date, so it is excluded as
    // ORS_NOT_APPROVED. Both excluded rows carry their distinct reason exactly
    // as they do at submit time.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-period-status',
      'file-period-status',
      createUploadData([
        { rowId: 1001, osrId: 100, exportTonnage: 100 },
        { rowId: 2001, osrId: 999, exportTonnage: 200 },
        { rowId: 3001, osrId: 200, exportTonnage: 300 }
      ])
    )

    expect(loadsByReportingPeriod).toEqual({
      openPeriodLoads: {
        added: {
          balanceAffecting: {
            count: 1,
            tonnageDelta: 100,
            rows: [
              {
                rowId: '1001',
                wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
                exclusionReasons: [],
                tonnageDelta: 100
              }
            ]
          },
          nonBalanceAffecting: {
            count: 2,
            rows: [
              {
                rowId: '2001',
                wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
                exclusionReasons: [CLASSIFICATION_REASON.ORS_NOT_FOUND],
                tonnageDelta: 0
              },
              {
                rowId: '3001',
                wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
                exclusionReasons: [CLASSIFICATION_REASON.ORS_NOT_APPROVED],
                tonnageDelta: 0
              }
            ]
          }
        },
        adjusted: emptyChange()
      },
      closedPeriodLoads: {
        added: emptyChange(),
        adjusted: emptyChange()
      },
      closedPeriods: []
    })
  })

  it('classifies a PRN-issued added load as nonBalanceAffecting in the open period', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    // A PRN/PERN-issued load passes validation but is excluded from the waste
    // balance, so it moves no tonnage and lands in nonBalanceAffecting.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-prn',
      'file-prn',
      createUploadData([
        { rowId: 1001, osrId: 100, exportTonnage: 100, prnIssued: 'Yes' }
      ])
    )

    expect(loadsByReportingPeriod.openPeriodLoads.added).toEqual({
      balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
      nonBalanceAffecting: {
        count: 1,
        rows: [
          {
            rowId: '1001',
            wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
            exclusionReasons: [CLASSIFICATION_REASON.PRN_ISSUED],
            tonnageDelta: 0
          }
        ]
      }
    })
  })

  it('records each nonBalanceAffecting row with its identity and exclusion reason', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    // A PRN/PERN-issued load is excluded from the waste balance for a known
    // reason. The expandable bucket must carry the row's identity and the
    // exclusion reason code so the check page can list it.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-prn-rows',
      'file-prn-rows',
      createUploadData([
        { rowId: 1001, osrId: 100, exportTonnage: 100, prnIssued: 'Yes' }
      ])
    )

    expect(
      loadsByReportingPeriod.openPeriodLoads.added.nonBalanceAffecting.rows
    ).toEqual([
      {
        rowId: '1001',
        wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
        exclusionReasons: [CLASSIFICATION_REASON.PRN_ISSUED],
        tonnageDelta: 0
      }
    ])
  })

  it('classifies an added load dated in a closed period as a closed-period load', async () => {
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      organisationId,
      registrationId
    })
    await closeJanuary2025(env)

    // The load's export dates are all in January 2025, which is now closed.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-closed',
      'file-closed',
      createUploadData([{ rowId: 1001, osrId: 100, exportTonnage: 100 }])
    )

    expect(
      loadsByReportingPeriod.closedPeriodLoads.added.balanceAffecting
    ).toEqual({
      count: 1,
      tonnageDelta: 100,
      rows: [
        {
          rowId: '1001',
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          exclusionReasons: [],
          tonnageDelta: 100
        }
      ]
    })
    expect(
      loadsByReportingPeriod.openPeriodLoads.added.balanceAffecting.count
    ).toBe(0)
  })

  it('persists closedPeriods for a closed-period load even while the feature is off', async () => {
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      organisationId,
      registrationId
    })
    await closeJanuary2025(env)

    // The flag is off (default) at validate time, but closedPeriods must still
    // be persisted so it survives to submit time when the flag flips on.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-closed-refs',
      'file-closed-refs',
      createUploadData([{ rowId: 1001, osrId: 100, exportTonnage: 100 }])
    )

    expect(loadsByReportingPeriod.closedPeriods).toEqual([
      { year: 2025, cadence: 'monthly', period: MONTHLY_PERIODS.January }
    ])
  })

  it('applies closed-wins when one date field is closed and another is open', async () => {
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      organisationId,
      registrationId
    })
    await closeJanuary2025(env)

    // DATE_RECEIVED_FOR_EXPORT is in closed January; DATE_OF_EXPORT is in open
    // February. Either date in a closed period forces the load closed.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-closed-wins',
      'file-closed-wins',
      createUploadData([
        {
          rowId: 1001,
          osrId: 100,
          exportTonnage: 100,
          dateReceived: '2025-01-15T00:00:00.000Z',
          dateReceivedByOsr: '2025-02-08T00:00:00.000Z',
          exportDate: '2025-02-10T00:00:00.000Z'
        }
      ])
    )

    expect(
      loadsByReportingPeriod.closedPeriodLoads.added.balanceAffecting.count
    ).toBe(1)
    expect(
      loadsByReportingPeriod.openPeriodLoads.added.balanceAffecting.count
    ).toBe(0)
  })

  it('aggregates count and tonnageDelta across multiple loads in the same period', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-aggregate',
      'file-aggregate',
      createUploadData([
        { rowId: 1001, osrId: 100, exportTonnage: 100 },
        { rowId: 1002, osrId: 100, exportTonnage: 200 }
      ])
    )

    expect(
      loadsByReportingPeriod.openPeriodLoads.added.balanceAffecting
    ).toEqual({
      count: 2,
      tonnageDelta: 300,
      rows: [
        {
          rowId: '1001',
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          exclusionReasons: [],
          tonnageDelta: 100
        },
        {
          rowId: '1002',
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          exclusionReasons: [],
          tonnageDelta: 200
        }
      ]
    })
  })

  it('classifies a re-uploaded load as an adjusted net delta in the open period', async () => {
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      organisationId,
      registrationId
    })

    // First submission establishes the load at 100t.
    await upload(
      env,
      'sl-original',
      'file-original',
      createUploadData([{ rowId: 1001, osrId: 100, exportTonnage: 100 }])
    )
    await submitAndPoll(env, 'sl-original')

    // Re-upload the same row at 150t (same open period): net delta +50.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-reupload',
      'file-reupload',
      createUploadData([{ rowId: 1001, osrId: 100, exportTonnage: 150 }])
    )

    expect(
      loadsByReportingPeriod.openPeriodLoads.adjusted.balanceAffecting
    ).toEqual({
      count: 1,
      tonnageDelta: 50,
      rows: [
        {
          rowId: '1001',
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          exclusionReasons: [],
          tonnageDelta: 50
        }
      ]
    })
    expect(
      loadsByReportingPeriod.openPeriodLoads.added.balanceAffecting.count
    ).toBe(0)
  })

  it('debits the closed period and credits the open period when a re-upload moves a load across periods', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })
    await closeJanuary2025(env)

    // Establish the load wholly within closed January.
    await upload(
      env,
      'sl-move-original',
      'file-move-original',
      createUploadData([
        {
          rowId: 1001,
          osrId: 100,
          exportTonnage: 100,
          dateReceived: '2025-01-15T00:00:00.000Z',
          dateReceivedByOsr: '2025-01-18T00:00:00.000Z',
          exportDate: '2025-01-20T00:00:00.000Z'
        }
      ])
    )
    await submitAndPoll(env, 'sl-move-original')

    // Re-upload the same row moved wholly into open February.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-move-reupload',
      'file-move-reupload',
      createUploadData([
        {
          rowId: 1001,
          osrId: 100,
          exportTonnage: 100,
          dateReceived: '2025-02-15T00:00:00.000Z',
          dateReceivedByOsr: '2025-02-18T00:00:00.000Z',
          exportDate: '2025-02-20T00:00:00.000Z'
        }
      ])
    )

    // The load leaves closed January (-100) and arrives in open February
    // (+100); each period it touches counts the load once.
    expect(
      loadsByReportingPeriod.closedPeriodLoads.adjusted.balanceAffecting
    ).toEqual({
      count: 1,
      tonnageDelta: -100,
      rows: [
        {
          rowId: '1001',
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          exclusionReasons: [],
          tonnageDelta: -100
        }
      ]
    })
    expect(
      loadsByReportingPeriod.openPeriodLoads.adjusted.balanceAffecting
    ).toEqual({
      count: 1,
      tonnageDelta: 100,
      rows: [
        {
          rowId: '1001',
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          exclusionReasons: [],
          tonnageDelta: 100
        }
      ]
    })
  })

  it('classifies a re-upload that nets to zero as nonBalanceAffecting', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    await upload(
      env,
      'sl-zero-original',
      'file-zero-original',
      createUploadData([
        {
          rowId: 1001,
          osrId: 100,
          exportTonnage: 100,
          dateReceived: '2025-01-15T00:00:00.000Z'
        }
      ])
    )
    await submitAndPoll(env, 'sl-zero-original')

    // Re-upload the same row with a corrected received date (still open
    // January) but unchanged tonnage: a real amendment whose net delta is
    // zero, so it moves no balance and lands in nonBalanceAffecting.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-zero-reupload',
      'file-zero-reupload',
      createUploadData([
        {
          rowId: 1001,
          osrId: 100,
          exportTonnage: 100,
          dateReceived: '2025-01-16T00:00:00.000Z'
        }
      ])
    )

    expect(loadsByReportingPeriod.openPeriodLoads.adjusted).toEqual({
      balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
      nonBalanceAffecting: {
        count: 1,
        rows: [
          {
            rowId: '1001',
            wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
            exclusionReasons: [],
            tonnageDelta: 0
          }
        ]
      }
    })
  })

  it('keeps a load amended to PRN-excluded in balanceAffecting as a reversal', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    // Establish an included load contributing 100t to the balance.
    await upload(
      env,
      'sl-reverse-original',
      'file-reverse-original',
      createUploadData([{ rowId: 1001, osrId: 100, exportTonnage: 100 }])
    )
    await submitAndPoll(env, 'sl-reverse-original')

    // Re-upload the same row PRN-issued, so its new contribution is zero. The
    // net delta of -100 still moved the balance, so it stays balanceAffecting.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-reverse-reupload',
      'file-reverse-reupload',
      createUploadData([
        { rowId: 1001, osrId: 100, exportTonnage: 100, prnIssued: 'Yes' }
      ])
    )

    expect(
      loadsByReportingPeriod.openPeriodLoads.adjusted.balanceAffecting
    ).toEqual({
      count: 1,
      tonnageDelta: -100,
      rows: [
        {
          rowId: '1001',
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          exclusionReasons: [CLASSIFICATION_REASON.PRN_ISSUED],
          tonnageDelta: -100
        }
      ]
    })
    expect(
      loadsByReportingPeriod.openPeriodLoads.adjusted.nonBalanceAffecting.count
    ).toBe(0)
  })

  // A registered-only operator has no accreditation, so it reports on a
  // quarterly cadence and its loads carry no waste-balance classifier.
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

  const REGISTERED_ONLY_RECEIVED_HEADERS = [
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
  ]

  const createRegisteredOnlyUploadData = (rows) => ({
    RECEIVED_LOADS_FOR_REPROCESSING: {
      location: { sheet: 'Received', row: TABLE_HEADER_ROW, column: 'A' },
      headers: REGISTERED_ONLY_RECEIVED_HEADERS,
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

  it('classifies registered-only loads by quarter, closing a submitted quarter', async () => {
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      accredited: false,
      organisationId,
      registrationId
    })

    // Submit Q1 2025 so a load received in January is closed, while a load
    // received in April (Q2) stays open.
    await createAndSubmitReport(env.reportsRepository, {
      organisationId,
      registrationId,
      year: 2025,
      cadence: 'quarterly',
      period: QUARTERLY_PERIODS.Q1,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-03-31T00:00:00.000Z',
      dueDate: '2025-05-20T00:00:00.000Z'
    })

    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-quarterly',
      'file-quarterly',
      createRegisteredOnlyUploadData([
        { rowId: 1001, month: '2025-01-01' },
        { rowId: 1002, month: '2025-04-01' }
      ]),
      registeredOnlyMeta
    )

    // Registered-only loads have no balance classifier, so both are
    // nonBalanceAffecting; the quarterly split puts Q1 closed and Q2 open.
    expect(
      loadsByReportingPeriod.closedPeriodLoads.added.nonBalanceAffecting.count
    ).toBe(1)
    expect(
      loadsByReportingPeriod.openPeriodLoads.added.nonBalanceAffecting.count
    ).toBe(1)
    expect(
      loadsByReportingPeriod.closedPeriodLoads.added.balanceAffecting.count
    ).toBe(0)
    expect(
      loadsByReportingPeriod.openPeriodLoads.added.balanceAffecting.count
    ).toBe(0)
  })

  it('includes loadsByReportingPeriod on the GET response after submit', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    await upload(
      env,
      'sl-submitted-period',
      'file-submitted-period',
      createUploadData([{ rowId: 1001, osrId: 100, exportTonnage: 100 }])
    )
    await submitAndPoll(env, 'sl-submitted-period')

    const { server, organisationId, registrationId } = env
    const response = await server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, 'sl-submitted-period'),
      ...asOperator()
    })
    const body = JSON.parse(response.payload)

    // After submit the document still carries loadsByReportingPeriod; the GET
    // status endpoint must serialise it so the confirmation page can detect
    // closed-period changes.
    expect(body.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
    expect(
      body.loadsByReportingPeriod.openPeriodLoads.added.balanceAffecting.count
    ).toBe(1)
  })
})
