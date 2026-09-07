import { http, HttpResponse } from 'msw'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  getWasteBalance,
  pollForValidation,
  pollWhileStatus,
  setupWasteBalanceIntegrationEnvironment,
  createWasteBalanceMeta,
  createExporterRowValues,
  createReprocessorReceivedRowValues,
  createReprocessorSentOnRowValues,
  createReprocessedRowValues,
  EXPORTER_HEADERS,
  REPROCESSOR_RECEIVED_HEADERS,
  REPROCESSOR_SENT_ON_HEADERS,
  REPROCESSED_LOADS_HEADERS
} from './integration-test-helpers.js'

/**
 * December waste-balance accrual (PAE-1920).
 *
 * The accreditation window in the shared test environment is
 * 2025-01-01..2025-12-31, so December of the accreditation year is 2025-12.
 * Tonnage whose balance-affecting date falls in that month accrues to a
 * separate `decemberAmount`; everything else stays in the general balance.
 * `amount` keeps its meaning as the full total, so the general portion is
 * `amount - decemberAmount` (derived, never stored).
 */
describe('December waste balance accrual', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  /**
   * Upload, validate, submit, and wait for the submission to land in the
   * ledger. The upload data shape is built per processing type by the callers.
   */
  const submit = async (
    env,
    meta,
    { summaryLogId, fileId, filename, data }
  ) => {
    const { server, fileDataMap, organisationId, registrationId } = env

    fileDataMap[fileId] = { meta, data }

    await server.inject({
      method: 'POST',
      url: buildPostUrl(organisationId, registrationId, summaryLogId),
      payload: createUploadPayload(
        organisationId,
        registrationId,
        UPLOAD_STATUS.COMPLETE,
        fileId,
        filename
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
      ...asOperator()
    })

    const status = await pollWhileStatus(
      server,
      organisationId,
      registrationId,
      summaryLogId,
      {
        waitWhile: SUMMARY_LOG_STATUS.SUBMITTING
      }
    )

    // Guard against a silently failed or timed-out submission: the balance
    // assertions that follow only mean something once the log is submitted.
    expect(status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
  }

  describe('exporter', () => {
    const meta = createWasteBalanceMeta('EXPORTER')

    const uploadData = (rows) => ({
      RECEIVED_LOADS_FOR_EXPORT: {
        location: { sheet: 'Received', row: 7, column: 'A' },
        headers: EXPORTER_HEADERS,
        rows: rows.map((row, index) => ({
          rowNumber: 8 + index,
          values: createExporterRowValues(row)
        }))
      }
    })

    // An exporter row bucketed into a given month by its DATE_RECEIVED_BY_OSR.
    const exporterRow = (rowId, isoMonth, tonnage) => ({
      rowId,
      dateReceived: `2025-${isoMonth}-01T00:00:00.000Z`,
      dateReceivedByOsr: `2025-${isoMonth}-18T00:00:00.000Z`,
      exportDate: `2025-${isoMonth}-20T00:00:00.000Z`,
      exportTonnage: tonnage
    })

    it('accrues a December row to a separate December amount, leaving the general balance the non-December total (AC1)', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })

      await submit(env, meta, {
        summaryLogId: 'summary-dec-exporter',
        fileId: 'file-dec-exporter',
        filename: 'waste-data.xlsx',
        data: uploadData([
          exporterRow(1001, '06', 100),
          exporterRow(1002, '12', 200)
        ])
      })

      const balance = await getWasteBalance(env)

      expect(balance.amount).toBe(300)
      expect(balance.decemberAmount).toBe(200)
      expect(balance.amount - balance.decemberAmount).toBe(100)
    })

    it('accrues nothing to December when no tonnage falls in December (AC2, AC6)', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })

      await submit(env, meta, {
        summaryLogId: 'summary-non-dec-exporter',
        fileId: 'file-non-dec-exporter',
        filename: 'waste-data.xlsx',
        data: uploadData([
          exporterRow(1001, '06', 100),
          exporterRow(1002, '07', 200)
        ])
      })

      const balance = await getWasteBalance(env)

      // The general balance carries the whole total; December stays zero.
      expect(balance.amount).toBe(300)
      expect(balance.decemberAmount).toBe(0)
    })

    it('self-corrects the December portion when a resubmission moves a row into and out of December (AC5)', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })

      // First submission: the row is dated June, so it is wholly general.
      await submit(env, meta, {
        summaryLogId: 'summary-move-1',
        fileId: 'file-move-1',
        filename: 'waste-data-v1.xlsx',
        data: uploadData([exporterRow(1001, '06', 100)])
      })

      let balance = await getWasteBalance(env)
      expect(balance.amount).toBe(100)
      expect(balance.decemberAmount).toBe(0)

      // Resubmission moves the same row into December: it now accrues to
      // December, and the general portion drops to zero.
      await submit(env, meta, {
        summaryLogId: 'summary-move-2',
        fileId: 'file-move-2',
        filename: 'waste-data-v2.xlsx',
        data: uploadData([exporterRow(1001, '12', 100)])
      })

      balance = await getWasteBalance(env)
      expect(balance.amount).toBe(100)
      expect(balance.decemberAmount).toBe(100)

      // Resubmission moves it back out of December: December self-corrects to
      // zero, general returns to the full total.
      await submit(env, meta, {
        summaryLogId: 'summary-move-3',
        fileId: 'file-move-3',
        filename: 'waste-data-v3.xlsx',
        data: uploadData([exporterRow(1001, '06', 100)])
      })

      balance = await getWasteBalance(env)
      expect(balance.amount).toBe(100)
      expect(balance.decemberAmount).toBe(0)
    })
  })

  describe('reprocessor input', () => {
    const meta = createWasteBalanceMeta('REPROCESSOR_INPUT')

    const uploadData = (receivedRows = [], sentOnRows = []) => ({
      RECEIVED_LOADS_FOR_REPROCESSING: {
        location: { sheet: 'Received', row: 7, column: 'A' },
        headers: REPROCESSOR_RECEIVED_HEADERS,
        rows: receivedRows.map((row, index) => ({
          rowNumber: 8 + index,
          values: createReprocessorReceivedRowValues(row)
        }))
      },
      SENT_ON_LOADS: {
        location: { sheet: 'Sent', row: 7, column: 'A' },
        headers: REPROCESSOR_SENT_ON_HEADERS,
        rows: sentOnRows.map((row, index) => ({
          rowNumber: 8 + index,
          values: createReprocessorSentOnRowValues(row)
        }))
      }
    })

    it('accrues a December received row to a separate December amount, keyed on the received-for-reprocessing date (AC1)', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'input'
      })

      await submit(env, meta, {
        summaryLogId: 'summary-dec-repro-in',
        fileId: 'file-dec-repro-in',
        filename: 'waste-data.xlsx',
        data: uploadData([
          {
            rowId: 1001,
            tonnageReceived: 100,
            dateReceived: '2025-06-16T00:00:00.000Z'
          },
          {
            rowId: 1002,
            tonnageReceived: 200,
            dateReceived: '2025-12-16T00:00:00.000Z'
          }
        ])
      })

      const balance = await getWasteBalance(env)

      expect(balance.amount).toBe(300)
      expect(balance.decemberAmount).toBe(200)
      expect(balance.amount - balance.decemberAmount).toBe(100)
    })

    it('deducts a December sent-on row from the December portion (uniform date-field rule)', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'input'
      })

      await submit(env, meta, {
        summaryLogId: 'summary-dec-repro-in-sent',
        fileId: 'file-dec-repro-in-sent',
        filename: 'waste-data.xlsx',
        data: uploadData(
          [
            {
              rowId: 1001,
              tonnageReceived: 300,
              dateReceived: '2025-06-16T00:00:00.000Z'
            },
            {
              rowId: 1002,
              tonnageReceived: 500,
              dateReceived: '2025-12-05T00:00:00.000Z'
            }
          ],
          [
            {
              rowId: 5001,
              tonnageSent: 100,
              dateLeft: '2025-12-20T00:00:00.000Z'
            }
          ]
        )
      })

      const balance = await getWasteBalance(env)

      // Total: 300 (June) + 500 (Dec) - 100 (Dec sent-on) = 700.
      // December: 500 credit - 100 sent-on = 400. General: 300 (June).
      expect(balance.amount).toBe(700)
      expect(balance.decemberAmount).toBe(400)
      expect(balance.amount - balance.decemberAmount).toBe(300)
    })
  })

  describe('reprocessor output', () => {
    const meta = createWasteBalanceMeta('REPROCESSOR_OUTPUT')

    const uploadData = (reprocessedRows = []) => ({
      REPROCESSED_LOADS: {
        location: { sheet: 'Reprocessed', row: 7, column: 'A' },
        headers: REPROCESSED_LOADS_HEADERS,
        rows: reprocessedRows.map((row, index) => ({
          rowNumber: 8 + index,
          values: createReprocessedRowValues(row)
        }))
      }
    })

    it('never accrues a December amount, even for a December-dated reprocessed row (AC3 invariant)', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'output'
      })

      await submit(env, meta, {
        summaryLogId: 'summary-dec-repro-out',
        fileId: 'file-dec-repro-out',
        filename: 'waste-data.xlsx',
        data: uploadData([
          {
            rowId: 3001,
            productUkPackagingWeightProportion: 100,
            dateLeft: '2025-12-15T00:00:00.000Z'
          }
        ])
      })

      const balance = await getWasteBalance(env)

      // The load-left-site date is not a received-for-recycling date, so the
      // row credits the general balance but accrues no December portion.
      expect(balance.amount).toBe(100)
      expect(balance.decemberAmount).toBe(0)
    })
  })
})
