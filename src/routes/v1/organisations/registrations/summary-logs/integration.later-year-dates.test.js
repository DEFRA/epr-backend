import { http, HttpResponse } from 'msw'

import { toYear } from '#common/helpers/dates/year.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  createExporterRowValues,
  createRegisteredOnlyMeta,
  createRegisteredOnlyReceivedRow,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  exporter2027Loads,
  ledgerIdOf,
  openNextYear,
  setupWasteBalanceIntegrationEnvironment,
  tableOf,
  uploadAndValidate,
  withTemplateYear
} from './integration-test-helpers.js'

const YEAR_2027 = toYear(2027)

const exporter2026Loads = (rows) => ({
  RECEIVED_LOADS_FOR_EXPORT: {
    location: { sheet: 'Exported (sections 1, 2 and 3)', row: 7, column: 'A' },
    headers: EXPORTER_HEADERS,
    rows: rows.map((row, index) => ({
      rowNumber: 8 + index,
      values: createExporterRowValues(row)
    }))
  }
})

const upload = (env, id, parsed) =>
  uploadAndValidate(
    env,
    { summaryLogId: `summary-${id}`, fileId: `file-${id}` },
    parsed
  )

const exporter2027Meta = () =>
  withTemplateYear(createWasteBalanceMeta('EXPORTER'), YEAR_2027)

const laterYearFailure = (header, expected) =>
  expect.objectContaining({
    code: 'INVALID_DATE',
    errorCode: 'DATE_AFTER_SUMMARY_LOG_YEAR',
    expected,
    location: expect.objectContaining({ header })
  })

describe('summary logs with a date in a later year', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  describe('a 2027 accredited exporter log', () => {
    const setup = () =>
      setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: YEAR_2027
      })

    it('is rejected for a 2028 date of export, with nothing stored', async () => {
      openNextYear()
      const env = await setup()

      const validated = await upload(env, '2027-export-2028', {
        meta: exporter2027Meta(),
        data: exporter2027Loads([
          { rowId: 1001, exportDate: '2028-01-03' },
          { rowId: 1002 }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        laterYearFailure('DATE_OF_EXPORT', 2027)
      ])
      expect(validated.validation.failures[0]).toMatchObject({
        location: { rowId: '1001' },
        actual: '2028-01-03'
      })
      expect(
        await env.summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
          ledgerIdOf(env),
          toSummaryLogFileId('file-2027-export-2028')
        )
      ).toStrictEqual([])
    })

    it('reports every later-year date cell', async () => {
      openNextYear()
      const env = await setup()

      const validated = await upload(env, '2027-three-rows', {
        meta: exporter2027Meta(),
        data: exporter2027Loads([
          { rowId: 1001, dateReceived: '2028-01-15' },
          { rowId: 1002, dateReceivedByOsr: '2029-01-18' },
          { rowId: 1003, dateRepatriated: '2028-02-01' }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        laterYearFailure('DATE_RECEIVED_FOR_EXPORT', 2027),
        laterYearFailure('DATE_RECEIVED_BY_OSR', 2027),
        laterYearFailure('DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED', 2027)
      ])
    })

    it('accepts dates up to 31 December 2027 and from earlier years', async () => {
      openNextYear()
      const env = await setup()

      const validated = await upload(env, '2027-in-year', {
        meta: exporter2027Meta(),
        data: exporter2027Loads([
          {
            rowId: 1001,
            dateReceived: '2026-12-30',
            exportDate: '2027-12-31'
          }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })
  })

  describe('a 2027 registered-only reprocessor log', () => {
    it('is rejected for a January 2028 month received', async () => {
      openNextYear()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        accredited: false,
        year: YEAR_2027
      })

      const validated = await upload(env, '2027-registered-only-2028', {
        meta: withTemplateYear(
          createRegisteredOnlyMeta('REPROCESSOR_REGISTERED_ONLY'),
          YEAR_2027
        ),
        data: {
          RECEIVED_LOADS_FOR_REPROCESSING: tableOf('Received', [
            {
              ...createRegisteredOnlyReceivedRow({
                rowId: 1001,
                month: '2028-01-01'
              }),
              DWT_SUPPLY_ID: null
            }
          ])
        }
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        laterYearFailure('MONTH_RECEIVED_FOR_REPROCESSING', 2027)
      ])
    })
  })

  describe('a 2026 accredited exporter log', () => {
    it('is rejected for a 2027 date', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })

      const validated = await upload(env, '2026-export-2027', {
        meta: createWasteBalanceMeta('EXPORTER'),
        data: exporter2026Loads([{ rowId: 1001, exportDate: '2027-01-01' }])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        laterYearFailure('DATE_OF_EXPORT', 2026)
      ])
    })
  })
})
