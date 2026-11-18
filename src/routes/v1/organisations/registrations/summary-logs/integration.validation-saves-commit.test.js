import { http, HttpResponse } from 'msw'

import { toSummaryLogId } from '#domain/summary-logs/ids.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
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

/** @typedef {Awaited<ReturnType<typeof setupWasteBalanceIntegrationEnvironment>>} Env */

describe('Validation saves what submission will commit', () => {
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
  const upload = async (env, summaryLogId, rows) => {
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

    return pollForValidation(server, summaryLogId)
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

  /**
   * @param {Env} env
   * @param {string} summaryLogId
   */
  const storedLog = async (env, summaryLogId) =>
    (await env.summaryLogsRepository.findById(toSummaryLogId(summaryLogId)))
      ?.summaryLog

  it('counts loads added and adjusted since the latest submission', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })
    expect(
      await upload(env, 'sl-first', [
        { rowId: 5001, exportTonnage: 100 },
        { rowId: 5002, exportTonnage: 100 }
      ])
    ).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    expect(await submit(env, 'sl-first')).toBe(SUMMARY_LOG_STATUS.SUBMITTED)

    expect(
      await upload(env, 'sl-second', [
        { rowId: 5001, exportTonnage: 100 },
        { rowId: 5002, exportTonnage: 80 },
        { rowId: 5003, exportTonnage: 30 }
      ])
    ).toBe(SUMMARY_LOG_STATUS.VALIDATED)

    expect((await storedLog(env, 'sl-second'))?.commit).toMatchObject({
      payload: { creditTotal: 210, decemberCreditTotal: 0 },
      counts: { created: 1, updated: 1, decemberWasteRowCount: 0 }
    })
  })

  it('saves nothing for submission when the upload is invalid', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })

    expect(
      await upload(env, 'sl-invalid', [
        { rowId: 6001, exportTonnage: 'not a number' }
      ])
    ).toBe(SUMMARY_LOG_STATUS.INVALID)

    expect(await storedLog(env, 'sl-invalid')).not.toHaveProperty('commit')
  })
})
