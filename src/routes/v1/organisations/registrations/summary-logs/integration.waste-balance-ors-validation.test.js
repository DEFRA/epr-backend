import { http, HttpResponse } from 'msw'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

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

describe('ORS waste balance validation (VAL014) with feature flag enabled', () => {
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

  const uploadAndSubmit = async (env, summaryLogId, fileId, uploadData) => {
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
  }

  it('should include row with approved ORS in waste balance', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      featureFlagOverrides: { orsWasteBalanceValidation: true }
    })
    const { wasteBalancesRepository, accreditationId } = env

    // OSR_ID 100 is in the test org's overseas sites map and the overseas
    // sites repository has it with validFrom=2025-01-01. The default export
    // date is 2025-01-20 which is after validFrom, so the ORS is approved.
    const uploadData = createUploadData([{ rowId: 1001, exportTonnage: 100 }])

    await uploadAndSubmit(env, 'sl-ors-approved', 'file-ors-1', uploadData)

    const balance =
      await wasteBalancesRepository.findByAccreditationId(accreditationId)

    expect(balance).toBeDefined()
    expect(balance.transactions).toHaveLength(1)
    expect(balance.amount).toBe(100)
  })

  it('should exclude row with unapproved ORS from waste balance', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      featureFlagOverrides: { orsWasteBalanceValidation: true }
    })
    const { wasteBalancesRepository, accreditationId } = env

    // OSR_ID 999 is not in the registration's overseas sites map,
    // so the ORS lookup will not find it and the row should be excluded.
    const uploadData = createUploadData([
      { rowId: 2001, osrId: 999, exportTonnage: 200 },
      {
        rowId: 2002,
        exportTonnage: 150,
        dateReceived: '2025-01-16T00:00:00.000Z',
        exportDate: '2025-01-21T00:00:00.000Z'
      }
    ])

    await uploadAndSubmit(env, 'sl-ors-unapproved', 'file-ors-2', uploadData)

    const balance =
      await wasteBalancesRepository.findByAccreditationId(accreditationId)

    expect(balance).toBeDefined()
    // Only row 2002 (approved ORS) should contribute
    expect(balance.transactions).toHaveLength(1)
    expect(balance.amount).toBe(150)
    expect(balance.transactions[0].entities[0].id).toBe('2002')
  })
})
