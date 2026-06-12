import { http, HttpResponse } from 'msw'

import { UPLOAD_STATUS } from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
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

    const response = await server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    return JSON.parse(response.payload)
  }

  it('splits added loads into balanceAffecting and nonBalanceAffecting by ORS approval', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    // Both loads export on 2025-01-20 (an open period, since no reports are
    // submitted). Row 100t uses OSR_ID 100, which is approved from 2025-01-01,
    // so it counts toward the predicted waste-balance delta. Row 200t uses
    // OSR_ID 999, which has no approved overseas site, so it must be excluded
    // from the delta exactly as it is at submit time.
    const uploadData = createUploadData([
      { rowId: 1001, osrId: 100, exportTonnage: 100 },
      { rowId: 2001, osrId: 999, exportTonnage: 200 }
    ])

    const payload = await uploadAndValidate(
      env,
      'sl-period-status',
      'file-period-status',
      uploadData
    )

    expect(payload.loadsByReportingPeriod).toEqual({
      openPeriodLoads: {
        added: {
          balanceAffecting: { count: 1, tonnageDelta: 100 },
          nonBalanceAffecting: { count: 1 }
        },
        adjusted: {
          balanceAffecting: { count: 0, tonnageDelta: 0 },
          nonBalanceAffecting: { count: 0 }
        }
      },
      closedPeriodLoads: {
        added: {
          balanceAffecting: { count: 0, tonnageDelta: 0 },
          nonBalanceAffecting: { count: 0 }
        },
        adjusted: {
          balanceAffecting: { count: 0, tonnageDelta: 0 },
          nonBalanceAffecting: { count: 0 }
        }
      }
    })
  })
})
