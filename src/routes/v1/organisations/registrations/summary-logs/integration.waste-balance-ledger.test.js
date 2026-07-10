import { ObjectId } from 'mongodb'
import { http, HttpResponse } from 'msw'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'

import {
  asOperator,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation,
  setupWasteBalanceIntegrationEnvironment,
  createWasteBalanceMeta,
  createExporterRowValues,
  EXPORTER_HEADERS
} from './integration-test-helpers.js'

describe('Waste balance stream (Exporter)', () => {
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

  const uploadAndValidate = async (env, summaryLogId, fileId, uploadData) => {
    const { server, organisationId, registrationId, fileDataMap } = env
    fileDataMap[fileId] = { meta: sharedMeta, data: uploadData }

    await server.inject({
      method: 'POST',
      url: buildPostUrl(organisationId, registrationId, summaryLogId),
      payload: createUploadPayload(
        organisationId,
        registrationId,
        UPLOAD_STATUS.COMPLETE,
        fileId,
        `${fileId}.xlsx`
      ),
      ...asOperator()
    })

    await pollForValidation(
      server,
      organisationId,
      registrationId,
      summaryLogId
    )
  }

  const submitAndPoll = async (env, summaryLogId) => {
    const { server, organisationId, registrationId } = env

    await server.inject({
      method: 'POST',
      url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    let attempts = 0
    let status = SUMMARY_LOG_STATUS.SUBMITTING
    while (status === SUMMARY_LOG_STATUS.SUBMITTING && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      const checkResponse = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        ...asOperator()
      })
      status = JSON.parse(checkResponse.payload).status
      attempts++
    }
    return status
  }

  const performSubmission = async (env, summaryLogId, fileId, uploadData) => {
    await uploadAndValidate(env, summaryLogId, fileId, uploadData)
    await submitAndPoll(env, summaryLogId)
  }

  const setupStream = () => {
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    return setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      organisationId,
      registrationId
    })
  }

  it('appends a single stream event with aggregate creditTotal on first upload', async () => {
    const env = await setupStream()
    const {
      ledgerRepository,
      organisationId,
      registrationId,
      wasteBalanceService
    } = env

    await performSubmission(
      env,
      'log-first',
      'file-first',
      createUploadData([
        { rowId: 1001, exportTonnage: 100 },
        {
          rowId: 1002,
          exportTonnage: 200,
          dateReceived: '2025-01-16T00:00:00.000Z',
          dateOfExport: '2025-01-21T00:00:00.000Z'
        }
      ])
    )

    const latest = await ledgerRepository.findLatestInLedger({
      organisationId,
      registrationId,
      accreditationId: 'ACC-123'
    })
    expect(latest).not.toBeNull()
    if (!latest) throw new Error('latest stream event is null')
    expect(latest.number).toBe(1)
    expect(latest.kind).toBe(LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
    expect(
      /** @type {{ creditTotal: number }} */ (latest.payload).creditTotal
    ).toBe(300)
    expect(latest.closingBalance).toEqual({
      amount: 300,
      availableAmount: 300
    })

    const resolvedBalance = await wasteBalanceService.currentBalance({
      organisationId: env.organisationId,
      registrationId,
      accreditationId: 'ACC-123'
    })
    expect(resolvedBalance?.amount).toBe(300)
    expect(resolvedBalance?.availableAmount).toBe(300)
  })

  it('computes correct delta on re-upload with identical data', async () => {
    const env = await setupStream()
    const { ledgerRepository, organisationId, registrationId } = env
    const data = createUploadData([{ rowId: 2001, exportTonnage: 50 }])

    await performSubmission(env, 'log-a', 'file-a', data)
    const afterFirst = await ledgerRepository.findLatestInLedger({
      organisationId,
      registrationId,
      accreditationId: 'ACC-123'
    })

    await performSubmission(env, 'log-b', 'file-b', data)
    const afterSecond = await ledgerRepository.findLatestInLedger({
      organisationId,
      registrationId,
      accreditationId: 'ACC-123'
    })

    if (!afterSecond) throw new Error('afterSecond stream event is null')
    if (!afterFirst) throw new Error('afterFirst stream event is null')
    expect(afterSecond.number).toBe(2)
    expect(afterSecond.closingBalance).toEqual(afterFirst.closingBalance)
  })

  it('computes correct delta when a row is corrected on re-upload', async () => {
    const env = await setupStream()
    const { ledgerRepository, organisationId, registrationId } = env

    await performSubmission(
      env,
      'log-1',
      'file-1',
      createUploadData([
        { rowId: 3001, exportTonnage: 100 },
        {
          rowId: 3002,
          exportTonnage: 200,
          dateReceived: '2025-01-16T00:00:00.000Z',
          dateOfExport: '2025-01-21T00:00:00.000Z'
        }
      ])
    )

    await performSubmission(
      env,
      'log-2',
      'file-2',
      createUploadData([
        { rowId: 3001, exportTonnage: 100 },
        {
          rowId: 3002,
          exportTonnage: 100,
          dateReceived: '2025-01-16T00:00:00.000Z',
          dateOfExport: '2025-01-21T00:00:00.000Z',
          grossWeight: 1000,
          tareWeight: 100,
          palletWeight: 50,
          netWeight: 850
        }
      ])
    )

    const latest = await ledgerRepository.findLatestInLedger({
      organisationId,
      registrationId,
      accreditationId: 'ACC-123'
    })
    if (!latest) throw new Error('latest stream event is null')
    expect(latest.number).toBe(2)
    expect(
      /** @type {{ creditTotal: number }} */ (latest.payload).creditTotal
    ).toBe(200)
    expect(latest.closingBalance).toEqual({
      amount: 200,
      availableAmount: 200
    })
  })

  it('audits each successful stream append into the system-logs repository', async () => {
    const env = await setupStream()
    const { systemLogsForBalanceAudit } = env

    systemLogsForBalanceAudit.insert.mockClear()

    await performSubmission(
      env,
      'log-audit',
      'file-audit',
      createUploadData([{ rowId: 9001, exportTonnage: 50 }])
    )

    expect(systemLogsForBalanceAudit.insert).toHaveBeenCalledTimes(1)
    const [entry] = systemLogsForBalanceAudit.insert.mock.calls[0]
    expect(entry.event).toEqual({
      category: 'waste-reporting',
      subCategory: 'waste-balance',
      action: 'update'
    })
    expect(entry.context.amount).toBe(50)
    expect(entry.context.availableAmount).toBe(50)
    expect(entry.context.events).toHaveLength(1)
    expect(entry.createdBy).toBeDefined()
  })
})
