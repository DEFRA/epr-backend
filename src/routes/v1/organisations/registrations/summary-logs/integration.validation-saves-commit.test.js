import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'

import { toSummaryLogFileId, toSummaryLogId } from '#domain/summary-logs/ids.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
  buildPostUrl,
  buildSubmitUrl,
  createExporterRowValues,
  createUploadPayload,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  ledgerIdOf,
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

    expect((await storedLog(env, 'sl-second'))?.commit).toStrictEqual({
      contextHash: expect.stringMatching(/^[0-9a-f]{64}$/),
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
    expect(
      await env.summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
        ledgerIdOf(env),
        toSummaryLogFileId(fileIdOf('sl-invalid'))
      )
    ).toEqual([])
  })

  it('fails permanently when a retry finds the rows an earlier attempt saved', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter'
    })
    vi.spyOn(env.summaryLogsRepository, 'update').mockRejectedValueOnce(
      new Error('lost connection before the log was marked validated')
    )
    env.fileDataMap[fileIdOf('sl-retried')] = {
      meta: createWasteBalanceMeta('EXPORTER'),
      data: exportedLoads([{ rowId: 7001, exportTonnage: 100 }])
    }
    await env.server.inject({
      method: 'POST',
      url: buildPostUrl('sl-retried'),
      payload: createUploadPayload(
        env.organisationId,
        env.registrationId,
        UPLOAD_STATUS.COMPLETE,
        fileIdOf('sl-retried'),
        'waste-data.xlsx'
      )
    })
    expect((await storedLog(env, 'sl-retried'))?.status).toBe(
      SUMMARY_LOG_STATUS.VALIDATING
    )

    await expect(
      env.validateSummaryLog(toSummaryLogId('sl-retried'))
    ).rejects.toBeInstanceOf(PermanentError)
  })
})
