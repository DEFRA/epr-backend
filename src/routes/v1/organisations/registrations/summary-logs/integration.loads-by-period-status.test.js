import { http, HttpResponse } from 'msw'
import { ObjectId } from 'mongodb'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import { createAndSubmitReport } from '#reports/repository/contract/test-data.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createExporterRowValues,
  createUploadPayload,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  pollForValidation,
  setupWasteBalanceIntegrationEnvironment
} from './integration-test-helpers.js'

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
      location: { sheet: 'Received', row: 7, column: 'A' },
      headers: EXPORTER_HEADERS,
      rows: rows.map((row, index) => ({
        rowNumber: 8 + index,
        values: createExporterRowValues(row)
      }))
    }
  })

  const upload = async (env, summaryLogId, fileId, uploadData) => {
    const { server, fileDataMap, organisationId, registrationId } = env

    fileDataMap[fileId] = { meta: sharedMeta, data: uploadData }

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
      ...asStandardUser({ linkedOrgId: organisationId })
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
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    let attempts = 0
    let status = SUMMARY_LOG_STATUS.SUBMITTING
    while (status === SUMMARY_LOG_STATUS.SUBMITTING && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      const response = await env.server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })
      status = JSON.parse(response.payload).status
      attempts++
    }
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
    balanceAffecting: { count: 0, tonnageDelta: 0 },
    nonBalanceAffecting: { count: 0 }
  })

  it('splits added loads into balanceAffecting and nonBalanceAffecting by ORS approval', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    // Both loads export on 2025-01-20 (an open period, since no reports are
    // submitted). Row 100t uses OSR_ID 100, which is approved from 2025-01-01,
    // so it counts toward the predicted waste-balance delta. Row 200t uses
    // OSR_ID 999, which has no approved overseas site, so it must be excluded
    // from the delta exactly as it is at submit time.
    const loadsByReportingPeriod = await uploadAndValidate(
      env,
      'sl-period-status',
      'file-period-status',
      createUploadData([
        { rowId: 1001, osrId: 100, exportTonnage: 100 },
        { rowId: 2001, osrId: 999, exportTonnage: 200 }
      ])
    )

    expect(loadsByReportingPeriod).toEqual({
      openPeriodLoads: {
        added: {
          balanceAffecting: { count: 1, tonnageDelta: 100 },
          nonBalanceAffecting: { count: 1 }
        },
        adjusted: emptyChange()
      },
      closedPeriodLoads: {
        added: emptyChange(),
        adjusted: emptyChange()
      }
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
      balanceAffecting: { count: 0, tonnageDelta: 0 },
      nonBalanceAffecting: { count: 1 }
    })
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
    ).toEqual({ count: 1, tonnageDelta: 100 })
    expect(
      loadsByReportingPeriod.openPeriodLoads.added.balanceAffecting.count
    ).toBe(0)
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
      tonnageDelta: 300
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
    ).toEqual({ count: 1, tonnageDelta: 50 })
    expect(
      loadsByReportingPeriod.openPeriodLoads.added.balanceAffecting.count
    ).toBe(0)
  })
})
