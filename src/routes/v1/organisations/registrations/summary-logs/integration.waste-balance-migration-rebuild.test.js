import assert from 'node:assert/strict'

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { compareForEmbedded } from '#server/run-balance-divergence-diagnostic.js'

import {
  asStandardUser,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation,
  pollWhileStatus,
  setupWasteBalanceIntegrationEnvironment,
  createWasteBalanceMeta,
  createExporterRowValues,
  EXPORTER_HEADERS
} from './integration-test-helpers.js'

/**
 * Reads an accreditation's embedded waste balance, asserting it exists so
 * callers can read its fields without a null guard at every site.
 *
 * @param {{ findByAccreditationId: (accreditationId: string) => Promise<import('#waste-balances/domain/model.js').WasteBalance | null> }} wasteBalancesRepository
 * @param {string} accreditationId
 */
const getWasteBalance = async (wasteBalancesRepository, accreditationId) => {
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)
  assert(balance)
  return balance
}

/**
 * Rebuild an accreditation's balance from authoritative sources via the
 * production divergence-diagnostic path and return its embedded-vs-rebuilt
 * comparison.
 *
 * @param {Awaited<ReturnType<typeof setupWasteBalanceIntegrationEnvironment>>} env
 * @param {import('#waste-balances/domain/model.js').WasteBalance} embeddedBalance
 */
const rebuildComparison = (env, embeddedBalance) =>
  compareForEmbedded(
    {
      accreditationId: embeddedBalance.accreditationId,
      organisationId: env.organisationId,
      amount: embeddedBalance.amount,
      availableAmount: embeddedBalance.availableAmount
    },
    {
      organisationsRepository: env.organisationsRepository,
      prnRepository: env.packagingRecyclingNotesRepository,
      wasteRecordsRepository: env.wasteRecordsRepository,
      overseasSitesRepository: env.overseasSitesRepository,
      summaryLogsRepository: env.summaryLogsRepository
    }
  )

/**
 * Migration fidelity: a waste balance built through the real summary-log and
 * PRN flows must rebuild from authoritative sources (waste records + PRN
 * history) to the same totals. This is the pre-cutover invariant the PAE-1382
 * ledger relies on — the embedded balance and the event-sourced rebuild agree
 * for existing data — exercised here against data written by the real
 * ingestion paths rather than hand-crafted source objects.
 */
describe('Waste balance migration rebuild (Exporter)', () => {
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
        `${fileId}.xlsx`
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

    return pollWhileStatus(
      server,
      organisationId,
      registrationId,
      summaryLogId,
      {
        waitWhile: SUMMARY_LOG_STATUS.SUBMITTING,
        maxAttempts: 10
      }
    )
  }

  const performSummaryLogSubmission = async (
    env,
    summaryLogId,
    fileId,
    uploadData
  ) => {
    await uploadAndValidate(env, summaryLogId, fileId, uploadData)
    await submitAndPoll(env, summaryLogId)
  }

  const createPrn = async (env, tonnage) => {
    const { server, organisationId, registrationId, accreditationId } = env
    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
      ...asStandardUser({ linkedOrgId: organisationId }),
      payload: {
        issuedToOrganisation: {
          id: 'producer-org-123',
          name: 'Producer Org',
          tradingName: 'Producer Trading'
        },
        tonnage
      }
    })
    return JSON.parse(response.payload)
  }

  const transitionPrnStatus = async (env, prnId, status) => {
    const { server, organisationId, registrationId, accreditationId } = env
    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
      ...asStandardUser({ linkedOrgId: organisationId }),
      payload: { status }
    })
    return JSON.parse(response.payload)
  }

  it('rebuilds to the embedded balance across summary-log revisions and a raised, issued and deleted PRN', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })
    const { wasteBalancesRepository, accreditationId } = env

    await performSummaryLogSubmission(
      env,
      'log-rebuild-1',
      'file-rebuild-1',
      createUploadData([{ rowId: 1001, exportTonnage: 300 }])
    )

    const raised = await createPrn(env, 50)
    await transitionPrnStatus(env, raised.id, PRN_STATUS.AWAITING_AUTHORISATION)

    const issued = await createPrn(env, 100)
    await transitionPrnStatus(env, issued.id, PRN_STATUS.AWAITING_AUTHORISATION)
    await transitionPrnStatus(env, issued.id, PRN_STATUS.AWAITING_ACCEPTANCE)

    const deleted = await createPrn(env, 40)
    await transitionPrnStatus(
      env,
      deleted.id,
      PRN_STATUS.AWAITING_AUTHORISATION
    )
    await transitionPrnStatus(env, deleted.id, PRN_STATUS.DELETED)

    await performSummaryLogSubmission(
      env,
      'log-rebuild-2',
      'file-rebuild-2',
      createUploadData([{ rowId: 1001, exportTonnage: 250 }])
    )

    const embedded = await getWasteBalance(
      wasteBalancesRepository,
      accreditationId
    )
    // amount = 250 credited - 100 (the issued PRN deducts from total) = 150.
    // availableAmount = 250 credited - 50 (the raised PRN) - 100 (the issued
    // PRN's raise still ringfences available; issuing moves total, not
    // available) = 100. The deleted PRN's raise and restore net to zero.
    expect(embedded.amount).toBe(150)
    expect(embedded.availableAmount).toBe(100)

    const comparison = await rebuildComparison(env, embedded)

    expect(comparison.rebuiltAmount).toBe(150)
    expect(comparison.rebuiltAvailableAmount).toBe(100)
    expect(comparison.streamAmount).toBe(150)
    expect(comparison.streamAvailableAmount).toBe(100)

    expect(comparison.deltaAmount).toBe(0)
    expect(comparison.deltaAvailableAmount).toBe(0)
    expect(comparison.streamDeltaAmount).toBe(0)
    expect(comparison.streamDeltaAvailableAmount).toBe(0)

    // The deleted PRN is excluded from the accreditation's history, so the
    // rebuild never replays its raise and restore; the balance still
    // reconciles because those two cancel out.
    expect(comparison.prnCount).toBe(2)
  })
})
