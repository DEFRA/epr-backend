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
  getWasteBalance,
  ledgerIdOf,
  openNextYear,
  reprocessorReceivedLoads2027,
  setupWasteBalanceIntegrationEnvironment,
  submitAndWait,
  tableOf,
  uploadAndValidate,
  withTemplateYear
} from './integration-test-helpers.js'

const YEAR = toYear(2027)

const storedRows = (env, ledgerId, fileId) =>
  env.summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
    ledgerId,
    toSummaryLogFileId(fileId)
  )

describe('2027 summary logs', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  describe('an accredited exporter', () => {
    const setup = () =>
      setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: YEAR
      })

    it('validates and submits a 2027.01 log, crediting the balance and storing the new columns', async () => {
      openNextYear()
      const env = await setup()
      const ids = {
        summaryLogId: 'summary-2027-exporter',
        fileId: 'file-2027-exporter'
      }

      const validated = await uploadAndValidate(env, ids, {
        meta: withTemplateYear(createWasteBalanceMeta('EXPORTER'), YEAR),
        data: exporter2027Loads([
          {
            rowId: 1001,
            exportTonnage: 100,
            exitPort: 'Dover',
            dwtExportId: 987654,
            dwtSupplyId: 'DWT-2027-00012345'
          },
          { rowId: 1002, exportTonnage: 50 }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      expect((await submitAndWait(env, ids.summaryLogId)).status).toBe(
        SUMMARY_LOG_STATUS.SUBMITTED
      )

      const balance = await getWasteBalance(env)
      expect(balance.amount).toBe(150)

      const rows = await storedRows(env, ledgerIdOf(env), ids.fileId)
      expect(rows.find(({ rowId }) => rowId === '1001')).toMatchObject({
        data: {
          PREVIOUS_YEAR_ROW_ID: null,
          EXIT_PORT: 'Dover',
          DWT_EXPORT_ID: 987654,
          DWT_SUPPLY_ID: 'DWT-2027-00012345'
        },
        classification: { outcome: 'INCLUDED', transactionAmount: 100 }
      })
      expect(rows.find(({ rowId }) => rowId === '1002')?.data).toMatchObject({
        PREVIOUS_YEAR_ROW_ID: null,
        EXIT_PORT: null,
        DWT_EXPORT_ID: null,
        DWT_SUPPLY_ID: null
      })
    })

    it.each([
      [999, 'VALUE_OUT_OF_RANGE'],
      [1000.5, 'INVALID_TYPE'],
      ['row 1000', 'INVALID_TYPE']
    ])(
      'rejects PREVIOUS_YEAR_ROW_ID %s as %s',
      async (previousYearRowId, code) => {
        openNextYear()
        const env = await setup()

        const validated = await uploadAndValidate(
          env,
          {
            summaryLogId: 'summary-2027-bad-previous-row',
            fileId: 'file-2027-bad-previous-row'
          },
          {
            meta: withTemplateYear(createWasteBalanceMeta('EXPORTER'), YEAR),
            data: exporter2027Loads([{ rowId: 1001, previousYearRowId }])
          }
        )

        expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
        expect(validated.validation.failures).toContainEqual(
          expect.objectContaining({
            code,
            location: expect.objectContaining({
              header: 'PREVIOUS_YEAR_ROW_ID'
            })
          })
        )
      }
    )

    it('rejects a 2027 log without the 2027 columns', async () => {
      openNextYear()
      const env = await setup()

      const validated = await uploadAndValidate(
        env,
        {
          summaryLogId: 'summary-2027-2026-columns',
          fileId: 'file-2027-2026-columns'
        },
        {
          meta: withTemplateYear(createWasteBalanceMeta('EXPORTER'), YEAR),
          data: {
            RECEIVED_LOADS_FOR_EXPORT: tableOf('Exported', [
              Object.fromEntries(
                EXPORTER_HEADERS.map((header, index) => [
                  header,
                  createExporterRowValues()[index]
                ])
              )
            ])
          }
        }
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toContainEqual(
        expect.objectContaining({ code: 'HEADER_REQUIRED' })
      )
    })

    it('rejects a 2027 template in a 2026 log as TEMPLATE_YEAR_MISMATCH', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: toYear(2026)
      })

      const validated = await uploadAndValidate(
        env,
        {
          summaryLogId: 'summary-2026-2027-template',
          fileId: 'file-2026-2027-template'
        },
        {
          meta: withTemplateYear(createWasteBalanceMeta('EXPORTER'), YEAR),
          data: exporter2027Loads([{ rowId: 1001 }])
        }
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toContainEqual(
        expect.objectContaining({
          code: 'TEMPLATE_YEAR_MISMATCH',
          expected: 2026,
          actual: 2027
        })
      )
    })

    it('rejects a 2026 template in a 2027 log as TEMPLATE_YEAR_MISMATCH', async () => {
      openNextYear()
      const env = await setup()

      const validated = await uploadAndValidate(
        env,
        {
          summaryLogId: 'summary-2027-2026-template',
          fileId: 'file-2027-2026-template'
        },
        {
          meta: createWasteBalanceMeta('EXPORTER'),
          data: exporter2027Loads([{ rowId: 1001 }])
        }
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toContainEqual(
        expect.objectContaining({
          code: 'TEMPLATE_YEAR_MISMATCH',
          expected: 2027,
          actual: 2026
        })
      )
    })
  })

  describe('a registered-only reprocessor', () => {
    it('validates and submits a 2027.01 log, storing DWT_SUPPLY_ID as entered', async () => {
      openNextYear()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        accredited: false,
        year: YEAR
      })
      const ids = {
        summaryLogId: 'summary-2027-registered-only',
        fileId: 'file-2027-registered-only'
      }

      const validated = await uploadAndValidate(env, ids, {
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
                month: '2027-01-01'
              }),
              DWT_SUPPLY_ID: 12345678
            }
          ])
        }
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      expect((await submitAndWait(env, ids.summaryLogId)).status).toBe(
        SUMMARY_LOG_STATUS.SUBMITTED
      )

      const rows = await storedRows(
        env,
        ledgerIdOf({
          ...env,
          accreditationNumber: null
        }),
        ids.fileId
      )
      expect(rows).toEqual([
        expect.objectContaining({
          processingType: 'REPROCESSOR_REGISTERED_ONLY',
          data: expect.objectContaining({ DWT_SUPPLY_ID: 12345678 })
        })
      ])
    })
  })

  describe('a registered-only exporter', () => {
    it('validates and submits a 2027.01 log, storing the new LOADS_EXPORTED columns', async () => {
      openNextYear()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        accredited: false,
        year: YEAR
      })
      const ids = {
        summaryLogId: 'summary-2027-exporter-registered-only',
        fileId: 'file-2027-exporter-registered-only'
      }

      const validated = await uploadAndValidate(env, ids, {
        meta: withTemplateYear(
          createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
          YEAR
        ),
        data: {
          LOADS_EXPORTED: tableOf('Exported', [
            {
              ROW_ID: 2001,
              TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 9.975,
              DATE_OF_EXPORT: '2027-01-20T00:00:00.000Z',
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
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      expect((await submitAndWait(env, ids.summaryLogId)).status).toBe(
        SUMMARY_LOG_STATUS.SUBMITTED
      )

      const rows = await storedRows(
        env,
        ledgerIdOf({
          ...env,
          accreditationNumber: null
        }),
        ids.fileId
      )
      expect(rows).toEqual([
        expect.objectContaining({
          processingType: 'EXPORTER_REGISTERED_ONLY',
          data: expect.objectContaining({
            PREVIOUS_YEAR_ROW_ID: null,
            EXIT_PORT: 'Felixstowe',
            DWT_EXPORT_ID: 555123
          })
        })
      ])
    })
  })

  describe.each(
    /** @type {const} */ ([
      { reprocessingType: 'input', processingType: 'REPROCESSOR_INPUT' },
      { reprocessingType: 'output', processingType: 'REPROCESSOR_OUTPUT' }
    ])
  )('an accredited $processingType', ({ reprocessingType, processingType }) => {
    it('validates and submits a 2027.01 log, storing DWT_SUPPLY_ID as entered', async () => {
      openNextYear()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType,
        year: YEAR
      })
      const ids = {
        summaryLogId: `summary-2027-${reprocessingType}`,
        fileId: `file-2027-${reprocessingType}`
      }

      const validated = await uploadAndValidate(env, ids, {
        meta: withTemplateYear(createWasteBalanceMeta(processingType), YEAR),
        data: reprocessorReceivedLoads2027([
          { rowId: 1001, dwtSupplyId: 12345678 },
          { rowId: 1002 }
        ])
      })

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      expect((await submitAndWait(env, ids.summaryLogId)).status).toBe(
        SUMMARY_LOG_STATUS.SUBMITTED
      )

      const rows = await storedRows(env, ledgerIdOf(env), ids.fileId)
      expect(rows.find(({ rowId }) => rowId === '1001')).toMatchObject({
        processingType,
        data: { DWT_SUPPLY_ID: 12345678 }
      })
      expect(rows.find(({ rowId }) => rowId === '1002')?.data).toMatchObject({
        DWT_SUPPLY_ID: null
      })
    })
  })
})
