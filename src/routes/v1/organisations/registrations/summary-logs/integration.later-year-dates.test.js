import { http, HttpResponse } from 'msw'
import { onTestFinished } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { config } from '#root/config.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
  buildGetUrl,
  buildPostUrl,
  createExporterRowValues,
  createRegisteredOnlyReceivedRow,
  createUploadPayload,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  ledgerIdOf,
  pollForValidation,
  setupWasteBalanceIntegrationEnvironment,
  tableOf
} from './integration-test-helpers.js'

const EXPORTER_2027_HEADERS = [
  ...EXPORTER_HEADERS,
  'PREVIOUS_YEAR_ROW_ID',
  'EXIT_PORT',
  'DWT_EXPORT_ID',
  'DWT_SUPPLY_ID'
]

const exporterLoads = (year, rows) => ({
  RECEIVED_LOADS_FOR_EXPORT: {
    location: { sheet: 'Exported (sections 1, 2 and 3)', row: 7, column: 'A' },
    headers: year === 2027 ? EXPORTER_2027_HEADERS : EXPORTER_HEADERS,
    rows: rows.map((row, index) => ({
      rowNumber: 8 + index,
      values: [
        ...createExporterRowValues({
          dateReceived: `${year}-01-15T00:00:00.000Z`,
          dateReceivedByOsr: `${year}-01-18T00:00:00.000Z`,
          exportDate: `${year}-01-20T00:00:00.000Z`,
          ...row
        }),
        ...(year === 2027 ? [null, null, null, null] : [])
      ]
    }))
  }
})

const exporterMeta = (year) => {
  const meta = createWasteBalanceMeta('EXPORTER')
  return year === 2027
    ? {
        ...meta,
        TEMPLATE_VERSION: { ...meta.TEMPLATE_VERSION, value: 2027.01 }
      }
    : meta
}

const openYear2027 = () => {
  config.set('openNextYear', true)
  onTestFinished(() => config.reset('openNextYear'))
}

const upload = async (env, id, parsed) => {
  const summaryLogId = `summary-${id}`
  const fileId = `file-${id}`
  env.fileDataMap[fileId] = parsed
  await env.server.inject({
    method: 'POST',
    url: buildPostUrl(summaryLogId, {
      accredited: env.accredited,
      year: env.year
    }),
    payload: createUploadPayload(
      env.organisationId,
      env.registrationId,
      UPLOAD_STATUS.COMPLETE,
      fileId,
      `${fileId}.xlsx`
    )
  })
  await pollForValidation(env.server, summaryLogId)
  const response = await env.server.inject({
    method: 'GET',
    url: buildGetUrl(summaryLogId),
    ...asOperator()
  })
  return JSON.parse(response.payload)
}

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
        year: toYear(2027)
      })

    it('is rejected for a 2028 date of export, with nothing stored', async () => {
      openYear2027()
      const env = await setup()

      const validated = await upload(env, '2027-export-2028', {
        meta: exporterMeta(2027),
        data: exporterLoads(2027, [
          { rowId: 1001, exportDate: '2028-01-03T00:00:00.000Z' },
          { rowId: 1002 }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        laterYearFailure('DATE_OF_EXPORT', 2027)
      ])
      expect(validated.validation.failures[0]).toMatchObject({
        location: { rowId: '1001' },
        actual: '2028-01-03T00:00:00.000Z'
      })
      expect(
        await env.summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
          ledgerIdOf(env),
          toSummaryLogFileId('file-2027-export-2028')
        )
      ).toStrictEqual([])
    })

    it('reports every later-year date cell', async () => {
      openYear2027()
      const env = await setup()

      const validated = await upload(env, '2027-two-rows', {
        meta: exporterMeta(2027),
        data: exporterLoads(2027, [
          { rowId: 1001, dateReceived: '2028-01-15T00:00:00.000Z' },
          { rowId: 1002, dateReceivedByOsr: '2029-01-18T00:00:00.000Z' }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        laterYearFailure('DATE_RECEIVED_FOR_EXPORT', 2027),
        laterYearFailure('DATE_RECEIVED_BY_OSR', 2027)
      ])
    })

    it('accepts dates up to 31 December 2027 and from earlier years', async () => {
      openYear2027()
      const env = await setup()

      const validated = await upload(env, '2027-in-year', {
        meta: exporterMeta(2027),
        data: exporterLoads(2027, [
          {
            rowId: 1001,
            dateReceived: '2026-12-30T00:00:00.000Z',
            exportDate: '2027-12-31T00:00:00.000Z'
          }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })
  })

  describe('a 2027 registered-only reprocessor log', () => {
    it('is rejected for a January 2028 month received', async () => {
      openYear2027()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        accredited: false,
        year: toYear(2027)
      })

      const validated = await upload(env, '2027-registered-only-2028', {
        meta: {
          REGISTRATION_NUMBER: {
            value: 'REG123',
            location: { sheet: 'Cover', row: 1, column: 'B' }
          },
          PROCESSING_TYPE: {
            value: 'REPROCESSOR_REGISTERED_ONLY',
            location: { sheet: 'Cover', row: 2, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Cover', row: 3, column: 'B' }
          },
          TEMPLATE_VERSION: {
            value: 2027.01,
            location: { sheet: 'Cover', row: 4, column: 'B' }
          }
        },
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
        meta: exporterMeta(2026),
        data: exporterLoads(2026, [
          { rowId: 1001, exportDate: '2027-01-01T00:00:00.000Z' }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        laterYearFailure('DATE_OF_EXPORT', 2026)
      ])
    })
  })
})
