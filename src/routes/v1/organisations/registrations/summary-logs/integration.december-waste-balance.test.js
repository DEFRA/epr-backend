import { http, HttpResponse } from 'msw'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
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
  createReprocessorReceivedRowValues,
  createReprocessorSentOnRowValues,
  createReprocessedRowValues,
  createExporterRowValues,
  REPROCESSOR_RECEIVED_HEADERS,
  REPROCESSOR_SENT_ON_HEADERS,
  REPROCESSED_LOADS_HEADERS,
  EXPORTER_HEADERS
} from './integration-test-helpers.js'

// The test accreditation window is 2025-01-01 to 2025-12-31 (see
// integration-test-helpers.js), so the accreditation-year December is 2025-12,
// and it reaches 31 December, the caveat that lets December rows accrue at all.
const DEC = '2025-12-15T00:00:00.000Z'
const JAN = '2025-01-16T00:00:00.000Z'

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

  const table = (key, headers, builder, rows) => ({
    [key]: {
      location: { sheet: 'Data', row: 7, column: 'A' },
      headers,
      rows: rows.map((row, index) => ({
        rowNumber: 8 + index,
        values: builder(row)
      }))
    }
  })

  const exporterData = (rows) =>
    table(
      'RECEIVED_LOADS_FOR_EXPORT',
      EXPORTER_HEADERS,
      createExporterRowValues,
      rows
    )

  const reprocessorInputData = (received = [], sentOn = []) => ({
    ...table(
      'RECEIVED_LOADS_FOR_REPROCESSING',
      REPROCESSOR_RECEIVED_HEADERS,
      createReprocessorReceivedRowValues,
      received
    ),
    ...table(
      'SENT_ON_LOADS',
      REPROCESSOR_SENT_ON_HEADERS,
      createReprocessorSentOnRowValues,
      sentOn
    )
  })

  const reprocessorOutputData = (rows) =>
    table(
      'REPROCESSED_LOADS',
      REPROCESSED_LOADS_HEADERS,
      createReprocessedRowValues,
      rows
    )

  const upload = async (env, meta, summaryLogId, fileId, data) => {
    env.fileDataMap[fileId] = { meta, data }
    await env.server.inject({
      method: 'POST',
      url: buildPostUrl(env.organisationId, env.registrationId, summaryLogId),
      payload: createUploadPayload(
        env.organisationId,
        env.registrationId,
        UPLOAD_STATUS.COMPLETE,
        fileId,
        `${fileId}.xlsx`
      ),
      ...asOperator()
    })
    await pollForValidation(
      env.server,
      env.organisationId,
      env.registrationId,
      summaryLogId
    )
  }

  const submit = async (env, summaryLogId) => {
    await env.server.inject({
      method: 'POST',
      url: buildSubmitUrl(env.organisationId, env.registrationId, summaryLogId),
      ...asOperator()
    })
    return pollWhileStatus(
      env.server,
      env.organisationId,
      env.registrationId,
      summaryLogId,
      { waitWhile: SUMMARY_LOG_STATUS.SUBMITTING }
    )
  }

  const submitLoads = async (env, meta, summaryLogId, data) => {
    await upload(env, meta, summaryLogId, `${summaryLogId}-file`, data)
    await submit(env, summaryLogId)
  }

  const readLedger = async (env) => {
    const response = await env.server.inject({
      method: 'GET',
      url: `/v1/organisations/${env.organisationId}/registrations/${env.registrationId}/accreditations/${env.accreditationId}/waste-balance-ledger`,
      ...asServiceMaintainer()
    })
    expect(response.statusCode).toBe(200)
    return JSON.parse(response.payload)
  }

  describe('December tonnage accrues to a separate portion', () => {
    it('splits an exporter balance into a December portion and leaves non-December untouched', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })

      await submitLoads(
        env,
        createWasteBalanceMeta('EXPORTER'),
        'b1-exporter',
        exporterData([
          {
            rowId: 1001,
            exportTonnage: 100,
            dateReceived: '2025-12-01T00:00:00.000Z',
            exportDate: '2025-12-10T00:00:00.000Z',
            dateReceivedByOsr: DEC
          },
          { rowId: 1002, exportTonnage: 250, dateReceivedByOsr: JAN }
        ])
      )

      const balance = await getWasteBalance(env)

      // Total keeps its meaning: December is additive, not on top.
      expect(balance.amount).toBe(350)
      expect(balance.availableAmount).toBe(350)
      expect(balance.decemberAmount).toBe(100)
      expect(balance.decemberAvailableAmount).toBe(100)
      // General is derived: total minus December.
      expect(balance.amount - (balance.decemberAmount ?? 0)).toBe(250)
    })

    it('splits a reprocessor-input balance into a December portion', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'input'
      })

      await submitLoads(
        env,
        createWasteBalanceMeta('REPROCESSOR_INPUT'),
        'b1-input',
        reprocessorInputData([
          { rowId: 1001, tonnageReceived: 100, dateReceived: DEC },
          { rowId: 1002, tonnageReceived: 200, dateReceived: JAN }
        ])
      )

      const balance = await getWasteBalance(env)

      expect(balance.amount).toBe(300)
      expect(balance.decemberAmount).toBe(100)
      expect(balance.decemberAvailableAmount).toBe(100)
    })
  })

  describe('reprocessor-output accrues no December portion', () => {
    it('accrues a December-dated processed load to the general balance only', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'output'
      })

      await submitLoads(
        env,
        createWasteBalanceMeta('REPROCESSOR_OUTPUT'),
        'b2-output',
        reprocessorOutputData([
          {
            rowId: 3001,
            productUkPackagingWeightProportion: 100,
            dateLeft: DEC
          }
        ])
      )

      const balance = await getWasteBalance(env)

      expect(balance.amount).toBe(100)
      expect(balance.decemberAmount).toBeUndefined()
      expect(balance.decemberAvailableAmount).toBeUndefined()

      // The read endpoint carries no December fields for an output accreditation.
      const { events } = await readLedger(env)
      expect(events[0].balance.closing.decemberTotal).toBeUndefined()
      expect(events[0].balance.closing.decemberAvailable).toBeUndefined()
    })
  })

  describe('a resubmission across the December boundary self-corrects', () => {
    it('moves the portion to zero when December tonnage is corrected out', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'input'
      })
      const meta = createWasteBalanceMeta('REPROCESSOR_INPUT')

      await submitLoads(
        env,
        meta,
        'b3-out-1',
        reprocessorInputData([
          { rowId: 1001, tonnageReceived: 100, dateReceived: DEC }
        ])
      )
      const first = await getWasteBalance(env)
      expect(first.amount).toBe(100)
      expect(first.decemberAmount).toBe(100)

      await submitLoads(
        env,
        meta,
        'b3-out-2',
        reprocessorInputData([
          { rowId: 1001, tonnageReceived: 100, dateReceived: JAN }
        ])
      )
      const second = await getWasteBalance(env)
      expect(second.amount).toBe(100)
      expect(second.decemberAmount).toBe(0)
      expect(second.decemberAvailableAmount).toBe(0)
    })

    it('materialises the portion when tonnage is corrected into December', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'input'
      })
      const meta = createWasteBalanceMeta('REPROCESSOR_INPUT')

      await submitLoads(
        env,
        meta,
        'b3-in-1',
        reprocessorInputData([
          { rowId: 1001, tonnageReceived: 100, dateReceived: JAN }
        ])
      )
      const first = await getWasteBalance(env)
      expect(first.decemberAmount).toBeUndefined()

      await submitLoads(
        env,
        meta,
        'b3-in-2',
        reprocessorInputData([
          { rowId: 1001, tonnageReceived: 100, dateReceived: DEC }
        ])
      )
      const second = await getWasteBalance(env)
      expect(second.amount).toBe(100)
      expect(second.decemberAmount).toBe(100)
    })
  })

  describe('no December tonnage means no December portion', () => {
    it('leaves the December fields absent when nothing is December-dated', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'input'
      })

      await submitLoads(
        env,
        createWasteBalanceMeta('REPROCESSOR_INPUT'),
        'b4',
        reprocessorInputData([
          {
            rowId: 1001,
            tonnageReceived: 100,
            dateReceived: '2025-06-01T00:00:00.000Z'
          }
        ])
      )

      const balance = await getWasteBalance(env)
      expect(balance.amount).toBe(100)
      expect(balance.decemberAmount).toBeUndefined()
      expect(balance.decemberAvailableAmount).toBeUndefined()
    })
  })

  describe('a December date outside the accreditation window accrues nowhere', () => {
    it('ignores a previous-year December load in both the general and December portions', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'input'
      })

      await submitLoads(
        env,
        createWasteBalanceMeta('REPROCESSOR_INPUT'),
        'b5',
        reprocessorInputData([
          {
            rowId: 1001,
            tonnageReceived: 100,
            dateReceived: '2024-12-15T00:00:00.000Z'
          },
          {
            rowId: 1002,
            tonnageReceived: 200,
            dateReceived: '2025-06-01T00:00:00.000Z'
          }
        ])
      )

      const balance = await getWasteBalance(env)
      // The 2024 December row is outside the window, so it credits nothing.
      expect(balance.amount).toBe(200)
      expect(balance.decemberAmount).toBeUndefined()
    })
  })

  describe('the read endpoint emits the December fields', () => {
    it('surfaces decemberTotal and decemberAvailable on the closing balance', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'input'
      })

      await submitLoads(
        env,
        createWasteBalanceMeta('REPROCESSOR_INPUT'),
        'b8a',
        reprocessorInputData([
          { rowId: 1001, tonnageReceived: 100, dateReceived: DEC },
          { rowId: 1002, tonnageReceived: 200, dateReceived: JAN }
        ])
      )

      const { events } = await readLedger(env)
      const latest = events[events.length - 1]

      expect(latest.balance.closing.total).toBe(300)
      expect(latest.balance.closing.available).toBe(300)
      expect(latest.balance.closing.decemberTotal).toBe(100)
      expect(latest.balance.closing.decemberAvailable).toBe(100)
    })
  })
})
