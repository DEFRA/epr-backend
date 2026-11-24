import { http, HttpResponse } from 'msw'

import { toYear } from '#common/helpers/dates/year.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  createRegisteredOnlyMeta,
  createRegisteredOnlyReceivedRow,
  createWasteBalanceMeta,
  exporter2027Loads,
  ledgerIdOf,
  setupWasteBalanceIntegrationEnvironment,
  tableOf,
  uploadAndValidate,
  uploadOn,
  withTemplateYear
} from './integration-test-helpers.js'

const YEAR_2027 = toYear(2027)

/**
 * @param {string} header
 * @param {string} deadline
 * @param {{ rowId: string, actual: string }} cell
 */
const earlierYearFailure = (header, deadline, { rowId, actual }) =>
  expect.objectContaining({
    code: 'INVALID_DATE',
    errorCode: 'DATE_BEFORE_SUMMARY_LOG_YEAR',
    expected: 2027,
    deadline,
    actual,
    location: expect.objectContaining({ header, rowId })
  })

/**
 * @param {Awaited<ReturnType<typeof setupWasteBalanceIntegrationEnvironment>>} env
 * @param {string} id
 */
const storedRowsOf = (env, id) =>
  env.summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
    ledgerIdOf(env),
    toSummaryLogFileId(`file-${id}`)
  )

describe('summary logs with a date in an earlier year', () => {
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
    /** @param {string} id */
    const uploadWith2026DateOfExport = async (id) => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: YEAR_2027
      })
      const validated = await uploadAndValidate(
        env,
        { summaryLogId: `summary-${id}`, fileId: `file-${id}` },
        {
          meta: withTemplateYear(createWasteBalanceMeta('EXPORTER'), YEAR_2027),
          data: exporter2027Loads([
            {
              rowId: 1001,
              dateReceived: '2027-01-04',
              exportDate: '2026-12-30'
            }
          ])
        }
      )
      return { validated, storedRows: await storedRowsOf(env, id) }
    }

    it.each([
      ['in January 2027', '2027-01-10T09:00:00.000Z'],
      [
        'at 23:59:59 on 27 February 2027, the correction deadline',
        '2027-02-27T23:59:59.000Z'
      ]
    ])(
      'is rejected for a 2026 date of export when uploaded %s, with nothing stored',
      async (_label, uploadedAt) => {
        uploadOn(uploadedAt)

        const { validated, storedRows } = await uploadWith2026DateOfExport(
          'accredited-open-2026'
        )

        expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
        expect(validated.validation.failures).toStrictEqual([
          earlierYearFailure('DATE_OF_EXPORT', '2027-02-27', {
            rowId: '1001',
            actual: '2026-12-30'
          })
        ])
        expect(storedRows).toStrictEqual([])
      }
    )

    it('accepts a 2026 date of export from 28 February 2027, after the correction deadline', async () => {
      uploadOn('2027-02-28T00:00:00.000Z')

      const { validated } = await uploadWith2026DateOfExport(
        'accredited-closed-2026'
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })
  })

  describe('a 2027 registered-only exporter log', () => {
    /** @param {string} id */
    const uploadWith2026DateOfExport = async (id) => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        accredited: false,
        year: YEAR_2027
      })
      const validated = await uploadAndValidate(
        env,
        { summaryLogId: `summary-${id}`, fileId: `file-${id}` },
        {
          meta: withTemplateYear(
            createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
            YEAR_2027
          ),
          data: {
            LOADS_EXPORTED: tableOf('Exported', [
              {
                ROW_ID: 2001,
                TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 9.975,
                DATE_OF_EXPORT: '2026-12-30T00:00:00.000Z',
                OSR_ID: 100,
                BASEL_EXPORT_CODE: 'B3020',
                WAS_THE_WASTE_REFUSED: 'No',
                WAS_THE_WASTE_STOPPED: 'No',
                DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: null,
                OSR_NAME: 'Overseas Reprocessor A',
                OSR_COUNTRY: 'Vietnam-VN',
                CUSTOMS_CODES: '123456',
                CONTAINER_NUMBER: 'CONT123456',
                PREVIOUS_YEAR_ROW_ID: null,
                EXIT_PORT: 'Felixstowe',
                DWT_EXPORT_ID: 555123
              }
            ])
          }
        }
      )
      return {
        validated,
        storedRows: await storedRowsOf(
          { ...env, accreditationNumber: null },
          id
        )
      }
    }

    it('is rejected for a 2026 date of export at 23:59:59 on 20 March 2027, the correction deadline, with nothing stored', async () => {
      uploadOn('2027-03-20T23:59:59.000Z')

      const { validated, storedRows } = await uploadWith2026DateOfExport(
        'registered-only-open-2026'
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        earlierYearFailure('DATE_OF_EXPORT', '2027-03-20', {
          rowId: '2001',
          actual: '2026-12-30T00:00:00.000Z'
        })
      ])
      expect(storedRows).toStrictEqual([])
    })

    it('accepts a 2026 date of export from 21 March 2027, after the correction deadline', async () => {
      uploadOn('2027-03-21T00:00:00.000Z')

      const { validated } = await uploadWith2026DateOfExport(
        'registered-only-closed-2026'
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })
  })

  describe('a 2027 registered-only reprocessor log', () => {
    /** @param {string} id */
    const uploadWithDecember2026Received = async (id) => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        accredited: false,
        year: YEAR_2027
      })
      const validated = await uploadAndValidate(
        env,
        { summaryLogId: `summary-${id}`, fileId: `file-${id}` },
        {
          meta: withTemplateYear(
            createRegisteredOnlyMeta('REPROCESSOR_REGISTERED_ONLY'),
            YEAR_2027
          ),
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: tableOf('Received', [
              {
                ...createRegisteredOnlyReceivedRow({
                  rowId: 1001,
                  month: '2026-12-01'
                }),
                DWT_SUPPLY_ID: null
              }
            ])
          }
        }
      )
      return {
        validated,
        storedRows: await storedRowsOf(
          { ...env, accreditationNumber: null },
          id
        )
      }
    }

    it('is rejected for a December 2026 month received at 23:59:59 on 20 March 2027, the correction deadline, with nothing stored', async () => {
      uploadOn('2027-03-20T23:59:59.000Z')

      const { validated, storedRows } = await uploadWithDecember2026Received(
        'reprocessor-registered-only-open-2026'
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        earlierYearFailure('MONTH_RECEIVED_FOR_REPROCESSING', '2027-03-20', {
          rowId: '1001',
          actual: '2026-12-01'
        })
      ])
      expect(storedRows).toStrictEqual([])
    })
  })
})
