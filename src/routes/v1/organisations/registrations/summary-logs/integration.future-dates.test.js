import { http, HttpResponse } from 'msw'

import { config } from '#root/config.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  createExporterRowValues,
  createRegisteredOnlyMeta,
  createRegisteredOnlyReceivedRow,
  createReprocessorReceivedRowValues,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  ledgerIdOf,
  rejectFutureDates,
  REPROCESSOR_RECEIVED_HEADERS,
  setupWasteBalanceIntegrationEnvironment,
  tableOf,
  uploadAndValidate,
  uploadOn
} from './integration-test-helpers.js'

/** @param {Record<string, unknown>[]} rows */
const exporterLoads = (rows) => ({
  RECEIVED_LOADS_FOR_EXPORT: {
    location: { sheet: 'Exported (sections 1, 2 and 3)', row: 7, column: 'A' },
    headers: EXPORTER_HEADERS,
    rows: rows.map((row, index) => ({
      rowNumber: 8 + index,
      values: createExporterRowValues(row)
    }))
  }
})

/**
 * @param {Awaited<ReturnType<typeof setupWasteBalanceIntegrationEnvironment>>} env
 * @param {string} id
 * @param {object} parsed
 */
const upload = (env, id, parsed) =>
  uploadAndValidate(
    env,
    { summaryLogId: `summary-${id}`, fileId: `file-${id}` },
    parsed
  )

/**
 * @param {string} header
 * @param {{ rowId: string, actual: string }} cell
 */
const futureDateFailure = (header, { rowId, actual }) =>
  expect.objectContaining({
    code: 'INVALID_DATE',
    errorCode: 'FUTURE_DATE',
    actual,
    location: expect.objectContaining({ header, rowId })
  })

const accreditedExporter = () =>
  setupWasteBalanceIntegrationEnvironment({ processingType: 'exporter' })

describe('summary logs with a future date', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  describe('an accredited exporter log', () => {
    it.each([
      ['DATE_RECEIVED_FOR_EXPORT', 'dateReceived'],
      ['DATE_OF_EXPORT', 'exportDate'],
      ['DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED', 'dateRepatriated']
    ])(
      'is rejected for a future %s, with nothing stored',
      async (header, field) => {
        uploadOn('2026-11-27T10:00:00.000Z')
        rejectFutureDates()
        const env = await accreditedExporter()

        const validated = await upload(env, `future-${field}`, {
          meta: createWasteBalanceMeta('EXPORTER'),
          data: exporterLoads([{ rowId: 1001, [field]: '2026-11-28' }])
        })

        expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
        expect(validated.validation.failures).toStrictEqual([
          futureDateFailure(header, { rowId: '1001', actual: '2026-11-28' })
        ])
        expect(
          await env.summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
            ledgerIdOf(env),
            toSummaryLogFileId(`file-future-${field}`)
          )
        ).toStrictEqual([])
      }
    )

    it('accepts ‘Date received by overseas reprocessor’ the day after upload', async () => {
      uploadOn('2026-11-27T10:00:00.000Z')
      rejectFutureDates()
      const env = await accreditedExporter()

      const validated = await upload(env, 'osr-day-after', {
        meta: createWasteBalanceMeta('EXPORTER'),
        data: exporterLoads([{ rowId: 1001, dateReceivedByOsr: '2026-11-28' }])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })

    it('rejects ‘Date received by overseas reprocessor’ two days after upload', async () => {
      uploadOn('2026-11-27T10:00:00.000Z')
      rejectFutureDates()
      const env = await accreditedExporter()

      const validated = await upload(env, 'osr-two-days-after', {
        meta: createWasteBalanceMeta('EXPORTER'),
        data: exporterLoads([{ rowId: 1001, dateReceivedByOsr: '2026-11-29' }])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        futureDateFailure('DATE_RECEIVED_BY_OSR', {
          rowId: '1001',
          actual: '2026-11-29'
        })
      ])
    })

    it('lists every future date in one rejection', async () => {
      uploadOn('2026-11-27T10:00:00.000Z')
      rejectFutureDates()
      const env = await accreditedExporter()

      const validated = await upload(env, 'every-future-date', {
        meta: createWasteBalanceMeta('EXPORTER'),
        data: exporterLoads([
          { rowId: 1001, dateReceived: '2026-11-28', exportDate: '2026-12-01' },
          { rowId: 1002, dateRepatriated: '2026-12-24' }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        futureDateFailure('DATE_RECEIVED_FOR_EXPORT', {
          rowId: '1001',
          actual: '2026-11-28'
        }),
        futureDateFailure('DATE_OF_EXPORT', {
          rowId: '1001',
          actual: '2026-12-01'
        }),
        futureDateFailure('DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED', {
          rowId: '1002',
          actual: '2026-12-24'
        })
      ])
    })

    it('accepts dates up to 31 December when uploaded in January of the next year', async () => {
      uploadOn('2027-01-10T09:00:00.000Z')
      rejectFutureDates()
      const env = await accreditedExporter()

      const validated = await upload(env, 'uploaded-in-january', {
        meta: createWasteBalanceMeta('EXPORTER'),
        data: exporterLoads([
          {
            rowId: 1001,
            dateReceived: '2026-12-30',
            dateReceivedByOsr: '2026-12-31',
            exportDate: '2026-12-31'
          }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })

    it('accepts future dates when the rejectFutureDates feature flag is off', async () => {
      uploadOn('2026-11-27T10:00:00.000Z')
      const env = await accreditedExporter()

      const validated = await upload(env, 'flag-off', {
        meta: createWasteBalanceMeta('EXPORTER'),
        data: exporterLoads([{ rowId: 1001, exportDate: '2026-12-15' }])
      })

      expect(config.get('featureFlags.rejectFutureDates')).toBe(false)
      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })
  })

  describe('a registered-only exporter log', () => {
    it('is rejected for a future ‘Month received for export’', async () => {
      uploadOn('2026-11-27T10:00:00.000Z')
      rejectFutureDates()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        accredited: false
      })

      const validated = await upload(env, 'registered-only-exporter-month', {
        meta: createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
        data: {
          RECEIVED_LOADS_FOR_EXPORT: tableOf('Received', [
            createRegisteredOnlyReceivedRow(
              { rowId: 1001, month: '2026-12-01' },
              {
                monthHeader: 'MONTH_RECEIVED_FOR_EXPORT',
                tonnageHeader: 'TONNAGE_RECEIVED_FOR_EXPORT'
              }
            )
          ])
        }
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        futureDateFailure('MONTH_RECEIVED_FOR_EXPORT', {
          rowId: '1001',
          actual: '2026-12-01'
        })
      ])
    })
  })

  describe('a registered-only reprocessor log', () => {
    it('accepts ‘Month received’ in the month of upload', async () => {
      uploadOn('2026-11-27T10:00:00.000Z')
      rejectFutureDates()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        accredited: false
      })

      const validated = await upload(env, 'registered-only-upload-month', {
        meta: createRegisteredOnlyMeta('REPROCESSOR_REGISTERED_ONLY'),
        data: {
          RECEIVED_LOADS_FOR_REPROCESSING: tableOf('Received', [
            createRegisteredOnlyReceivedRow({
              rowId: 1001,
              month: '2026-11-01'
            })
          ])
        }
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })
  })

  describe('an accredited reprocessor input log', () => {
    it('is rejected for a future ‘Date received’', async () => {
      uploadOn('2026-11-27T10:00:00.000Z')
      rejectFutureDates()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor'
      })

      const validated = await upload(env, 'reprocessor-input-received', {
        meta: createWasteBalanceMeta('REPROCESSOR_INPUT'),
        data: {
          RECEIVED_LOADS_FOR_REPROCESSING: {
            location: { sheet: 'Received', row: 7, column: 'A' },
            headers: REPROCESSOR_RECEIVED_HEADERS,
            rows: [
              {
                rowNumber: 8,
                values: createReprocessorReceivedRowValues({
                  dateReceived: '2026-11-28',
                  tonnageReceived: 100
                })
              }
            ]
          }
        }
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        futureDateFailure('DATE_RECEIVED_FOR_REPROCESSING', {
          rowId: '1001',
          actual: '2026-11-28'
        })
      ])
    })
  })
})
