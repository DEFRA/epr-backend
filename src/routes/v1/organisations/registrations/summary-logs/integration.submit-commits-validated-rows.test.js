import { StatusCodes } from 'http-status-codes'
import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'

import { toSummaryLogId } from '#domain/summary-logs/ids.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { summaryLogRowStatesForLedger } from '#waste-records/application/read-summary-log-row-states.js'

import {
  asOperator,
  buildPostUrl,
  buildSubmitUrl,
  createExporterRowValues,
  createUploadPayload,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  getWasteBalance,
  ledgerIdOf,
  pollForValidation,
  pollWhileStatus,
  setupWasteBalanceIntegrationEnvironment,
  TEST_REGISTRATION_NUMBER
} from './integration-test-helpers.js'

/** @typedef {Awaited<ReturnType<typeof setupWasteBalanceIntegrationEnvironment>>} Env */

describe('Submitting commits what validation saved', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  /** @param {Record<string, unknown>[]} rows */
  const exportedLoads = (rows) => ({
    RECEIVED_LOADS_FOR_EXPORT: {
      location: { sheet: 'Received', row: 7, column: 'A' },
      headers: EXPORTER_HEADERS,
      rows: rows.map((row, index) => ({
        rowNumber: 8 + index,
        values: createExporterRowValues(row)
      }))
    }
  })

  /** @param {string} summaryLogId */
  const fileIdOf = (summaryLogId) => `file-${summaryLogId}`

  /**
   * @param {Env} env
   * @param {string} summaryLogId
   * @param {Record<string, unknown>[]} rows
   */
  const uploadAndValidate = async (env, summaryLogId, rows) => {
    const { server, fileDataMap, organisationId, registrationId } = env
    fileDataMap[fileIdOf(summaryLogId)] = {
      meta: createWasteBalanceMeta('EXPORTER'),
      data: exportedLoads(rows)
    }

    await server.inject({
      method: 'POST',
      url: buildPostUrl(summaryLogId),
      payload: createUploadPayload(
        organisationId,
        registrationId,
        UPLOAD_STATUS.COMPLETE,
        fileIdOf(summaryLogId),
        'waste-data.xlsx'
      )
    })

    expect(await pollForValidation(server, summaryLogId)).toBe(
      SUMMARY_LOG_STATUS.VALIDATED
    )
  }

  /**
   * @param {Env} env
   * @param {string} summaryLogId
   */
  const submit = async ({ server }, summaryLogId) => {
    await server.inject({
      method: 'POST',
      url: buildSubmitUrl(summaryLogId),
      ...asOperator()
    })

    return pollWhileStatus(server, summaryLogId, {
      waitWhile: SUMMARY_LOG_STATUS.SUBMITTING
    })
  }

  /** @param {Env} env */
  const submittedRowStates = (env) =>
    summaryLogRowStatesForLedger({
      ...ledgerIdOf(env),
      ledgerRepository: env.ledgerRepository,
      summaryLogRowStatesRepository: env.summaryLogRowStatesRepository
    })

  /**
   * Serves the exporter's overseas site 200 as approved from the start of the
   * year, as if the regulator approved it after the upload was validated.
   *
   * @param {Env} env
   */
  const approveSite200FromJanuary = (env) => {
    const { findByOrganisationNumber } = env.organisationReadRepository
    vi.spyOn(
      env.organisationReadRepository,
      'findByOrganisationNumber'
    ).mockImplementation(async (...args) => {
      const organisation = await findByOrganisationNumber(...args)
      const accreditation =
        organisation?.registrations[TEST_REGISTRATION_NUMBER]?.accreditations[
          env.year
        ]
      if (accreditation && 'overseasSites' in accreditation) {
        accreditation.overseasSites[200].approvedOn = '2026-01-01'
      }
      return organisation
    })
  }

  it('turns the submission away when an overseas site is approved after validation', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })
    await uploadAndValidate(env, 'sl-site-approved-late', [
      { rowId: 2001, osrId: 200, exportTonnage: 200 },
      { rowId: 2002, osrId: 100, exportTonnage: 150 }
    ])

    approveSite200FromJanuary(env)
    const summaryLogId = toSummaryLogId('sl-site-approved-late')
    const validated = await env.summaryLogsRepository.findById(summaryLogId)

    const response = await env.server.inject({
      method: 'POST',
      url: buildSubmitUrl(summaryLogId),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    const { summaryLog } = await waitForVersion(
      env.summaryLogsRepository,
      summaryLogId,
      (validated?.version ?? 0) + 2
    )
    expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUPERSEDED)
    expect(
      await env.wasteBalanceService.currentBalance(ledgerIdOf(env))
    ).toBeNull()
  })

  it('records an accredited first submission with no loads on the ledger', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })
    await uploadAndValidate(env, 'sl-no-loads', [])

    expect(await submit(env, 'sl-no-loads')).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
    expect((await getWasteBalance(env)).amount).toBe(0)
  })

  it('submits once the uploaded file is no longer available', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })
    await uploadAndValidate(env, 'sl-file-gone', [
      { rowId: 4001, exportTonnage: 120 }
    ])

    delete env.fileDataMap[fileIdOf('sl-file-gone')]

    expect(await submit(env, 'sl-file-gone')).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
    expect((await getWasteBalance(env)).amount).toBe(120)
  })

  it('leaves the committed rows and balance alone when a validated upload is never submitted', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })
    await uploadAndValidate(env, 'sl-submitted', [
      { rowId: 3001, exportTonnage: 100 }
    ])
    expect(await submit(env, 'sl-submitted')).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
    const committedRows = await submittedRowStates(env)

    await uploadAndValidate(env, 'sl-abandoned', [
      { rowId: 3001, exportTonnage: 300 },
      { rowId: 3002, exportTonnage: 50 }
    ])

    expect((await getWasteBalance(env)).amount).toBe(100)
    expect(await submittedRowStates(env)).toEqual(committedRows)
  })
})
