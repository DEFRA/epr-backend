import { http, HttpResponse } from 'msw'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { LEDGER_SOURCE_KIND } from '#waste-balances/repository/ledger-schema.js'

import {
  asStandardUser,
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

describe('Waste balance ledger (Exporter, flag ON)', () => {
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
      const checkResponse = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
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

  const setupV2 = () =>
    setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      featureFlagOverrides: { wasteBalanceLedger: true }
    })

  it('appends one ledger transaction per included row on first upload', async () => {
    const env = await setupV2()
    const { ledgerRepository, accreditationId, wasteBalancesRepository } = env

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

    const latest =
      await ledgerRepository.findLatestByAccreditationId(accreditationId)
    expect(latest).not.toBeNull()
    expect(latest.number).toBe(2)
    expect(latest.closingBalance).toEqual({
      amount: 300,
      availableAmount: 300
    })
    expect(latest.source.kind).toBe(LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW)

    const credited = await ledgerRepository.findCreditedAmountsByWasteRecordIds(
      accreditationId,
      ['exported:1001', 'exported:1002']
    )
    expect(credited.get('exported:1001')).toBe(100)
    expect(credited.get('exported:1002')).toBe(200)

    const v1Balance =
      await wasteBalancesRepository.findByAccreditationId(accreditationId)
    expect(v1Balance?.transactions ?? []).toHaveLength(0)
  })

  it('appends nothing on a re-upload of identical data (idempotency invariant)', async () => {
    const env = await setupV2()
    const { ledgerRepository, accreditationId } = env
    const data = createUploadData([{ rowId: 2001, exportTonnage: 50 }])

    await performSubmission(env, 'log-a', 'file-a', data)
    const afterFirst =
      await ledgerRepository.findLatestByAccreditationId(accreditationId)

    await performSubmission(env, 'log-b', 'file-b', data)
    const afterSecond =
      await ledgerRepository.findLatestByAccreditationId(accreditationId)

    expect(afterSecond.number).toBe(afterFirst.number)
    expect(afterSecond.closingBalance).toEqual(afterFirst.closingBalance)
  })

  it('emits a single delta when one row is corrected on re-upload', async () => {
    const env = await setupV2()
    const { ledgerRepository, accreditationId } = env

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

    const latest =
      await ledgerRepository.findLatestByAccreditationId(accreditationId)
    expect(latest.number).toBe(3)
    expect(latest.type).toBe('debit')
    expect(latest.amount).toBe(100)
    expect(latest.closingBalance).toEqual({
      amount: 200,
      availableAmount: 200
    })
    expect(latest.source.summaryLogRow.wasteRecordId).toBe('exported:3002')
  })

  it('audits each successful ledger append into the system-logs repository', async () => {
    const env = await setupV2()
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
    expect(entry.context.newTransactions).toHaveLength(1)
    expect(entry.createdBy).toBeDefined()
  })
})
