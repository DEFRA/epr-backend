import { http, HttpResponse } from 'msw'

import { toYear } from '#common/helpers/dates/year.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  createExporterRowValues,
  createRegisteredOnlyMeta,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  exporter2027Loads,
  getWasteBalance,
  ledgerIdOf,
  openNextYear,
  setupWasteBalanceIntegrationEnvironment,
  submitAndWait,
  tableOf,
  uploadAndValidate,
  uploadOn,
  withTemplateYear
} from './integration-test-helpers.js'

const PREVIOUS_YEAR = toYear(2026)
const YEAR = toYear(2027)
const PREVIOUS_YEAR_ACCREDITATION_NUMBER = toAccreditationNumber('ACC-122')

const EXPORT_COLUMNS_BLANK = {
  interimSite: null,
  interimSiteId: null,
  interimTonnage: null,
  dateReceivedByOsr: null,
  osrId: null,
  exportTonnage: null,
  exportDate: null,
  exportControls: null,
  baselCode: null,
  customsCode: null,
  containerNumber: null,
  wasteRefused: null,
  wasteStopped: null,
  osrName: null,
  osrCountry: null,
  tonnageReceivedByOsr: null,
  billOfLadingReference: null,
  customsDeclarationNumber: null
}

const RECEIPT_COLUMNS_AS_THE_2027_TEMPLATE_LEAVES_THEM = {
  dateReceived: null,
  ewcCode: null,
  wasteDescription: null,
  prnIssued: 'No',
  grossWeight: null,
  tareWeight: null,
  palletWeight: null,
  netWeight: 0,
  bailingWire: null,
  recyclablePropMethod: null,
  nonTargetWeight: null,
  recyclablePropPct: null,
  tonnageReceived: null,
  supplierName: null,
  supplierAddress: null,
  supplierPostcode: null,
  supplierEmail: null,
  supplierPhone: null,
  activitiesCarriedOutBySupplier: null
}

const EXPORTED_IN_JANUARY_2027 = {
  interimSite: 'No',
  dateReceivedByOsr: '2027-01-25',
  osrId: 100,
  exportTonnage: 100,
  exportDate: '2027-01-20',
  exportControls: 'Article 18 (Green list)',
  baselCode: 'B3020',
  customsCode: '123456',
  containerNumber: 'CONT123456',
  wasteRefused: 'No',
  wasteStopped: 'No'
}

/**
 * An accredited exporter's 2026 log holding one load received for export in
 * December 2026 and not yet exported.
 *
 * @param {Record<string, unknown>} [row]
 */
const accredited2026Log = (row = {}) => ({
  meta: {
    ...createWasteBalanceMeta('EXPORTER'),
    ACCREDITATION_NUMBER: {
      ...createWasteBalanceMeta('EXPORTER').ACCREDITATION_NUMBER,
      value: PREVIOUS_YEAR_ACCREDITATION_NUMBER
    }
  },
  data: {
    RECEIVED_LOADS_FOR_EXPORT: {
      location: {
        sheet: 'Exported (sections 1, 2 and 3)',
        row: 7,
        column: 'A'
      },
      headers: EXPORTER_HEADERS,
      rows: [
        {
          rowNumber: 8,
          values: createExporterRowValues({
            rowId: 1500,
            dateReceived: '2026-12-10T00:00:00.000Z',
            ...EXPORT_COLUMNS_BLANK,
            ...row
          })
        }
      ]
    }
  }
})

/** @param {Record<string, unknown>[]} rows */
const accredited2027Log = (rows) => ({
  meta: withTemplateYear(createWasteBalanceMeta('EXPORTER'), YEAR),
  data: exporter2027Loads(rows)
})

/**
 * The 2027 row completing the 2026 load: the receipt columns as the template
 * leaves them, the export columns supplied.
 *
 * @param {Record<string, unknown>} [row]
 */
const linkedRow = (row = {}) => ({
  rowId: 1001,
  previousYearRowId: 1500,
  ...RECEIPT_COLUMNS_AS_THE_2027_TEMPLATE_LEAVES_THEM,
  ...EXPORT_COLUMNS_BLANK,
  ...EXPORTED_IN_JANUARY_2027,
  ...row
})

const upload = async (env, year, summaryLogId, parsed) =>
  uploadAndValidate(
    env,
    { summaryLogId, fileId: `file-${summaryLogId}`, year },
    parsed
  )

const submitted = async (env, year, summaryLogId, parsed) => {
  expect((await upload(env, year, summaryLogId, parsed)).status).toBe(
    SUMMARY_LOG_STATUS.VALIDATED
  )
  expect((await submitAndWait(env, summaryLogId)).status).toBe(
    SUMMARY_LOG_STATUS.SUBMITTED
  )
}

const storedRow = async (env, ledgerId, summaryLogId, rowId) => {
  const rows =
    await env.summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
      ledgerId,
      toSummaryLogFileId(`file-${summaryLogId}`)
    )
  return rows.find((row) => row.rowId === rowId)
}

const previousYearRowStateId = async (env, summaryLogId) => {
  const [state] =
    await env.summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
      env.organisationNumber,
      env.registrationNumber,
      toSummaryLogFileId(`file-${summaryLogId}`)
    )
  return state.id
}

describe('2027 rows linked to a 2026 row', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  describe('an accredited exporter accredited in both years', () => {
    const setup = async () => {
      openNextYear()
      return setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: YEAR,
        previousYearAccreditationNumber: PREVIOUS_YEAR_ACCREDITATION_NUMBER
      })
    }

    it('fills in the receipt from the 2026 row, keeps the supplied export and credits the 2027 balance', async () => {
      const env = await setup()
      await submitted(env, PREVIOUS_YEAR, 'log-2026', accredited2026Log())

      await submitted(env, YEAR, 'log-2027', accredited2027Log([linkedRow()]))

      expect(await storedRow(env, ledgerIdOf(env), 'log-2027', '1001')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            PREVIOUS_YEAR_ROW_ID: 1500,
            DATE_RECEIVED_FOR_EXPORT: '2026-12-10T00:00:00.000Z',
            NET_WEIGHT: 850,
            TONNAGE_RECEIVED_FOR_EXPORT: 850,
            SUPPLIER_NAME: 'Supplier A',
            DATE_OF_EXPORT: '2027-01-20',
            TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 100
          }),
          link: {
            year: PREVIOUS_YEAR,
            rowId: '1500',
            rowStateId: await previousYearRowStateId(env, 'log-2026'),
            suppliedFields: expect.arrayContaining([
              'DATE_OF_EXPORT',
              'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'
            ])
          },
          classification: expect.objectContaining({
            outcome: 'INCLUDED',
            transactionAmount: 100
          })
        })
      )
      expect((await getWasteBalance(env)).amount).toBe(100)
    })

    it('fills in an export column left blank on the 2027 row from the 2026 row', async () => {
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log({ containerNumber: 'CONT-2026' })
      )

      await submitted(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([linkedRow({ containerNumber: null })])
      )

      const row = await storedRow(env, ledgerIdOf(env), 'log-2027', '1001')
      expect(row?.data.CONTAINER_NUMBER).toBe('CONT-2026')
      expect(row?.link?.suppliedFields).not.toContain('CONTAINER_NUMBER')
    })

    it('ignores a value typed in a receipt column on the 2027 row and uses the 2026 value', async () => {
      const env = await setup()
      await submitted(env, PREVIOUS_YEAR, 'log-2026', accredited2026Log())

      await submitted(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          linkedRow({
            dateReceived: '2027-01-02',
            grossWeight: 600,
            tareWeight: 50,
            palletWeight: 50,
            netWeight: 500,
            nonTargetWeight: 0,
            recyclablePropPct: 1,
            tonnageReceived: 500
          })
        ])
      )

      expect(
        (await storedRow(env, ledgerIdOf(env), 'log-2027', '1001'))?.data
      ).toEqual(
        expect.objectContaining({
          DATE_RECEIVED_FOR_EXPORT: '2026-12-10T00:00:00.000Z',
          NET_WEIGHT: 850,
          TONNAGE_RECEIVED_FOR_EXPORT: 850
        })
      )
    })

    it('rejects a 2026 export date supplied on a linked row while 2026 can still be corrected', async () => {
      uploadOn('2027-01-10T09:00:00.000Z')
      const env = await setup()
      await submitted(env, PREVIOUS_YEAR, 'log-2026', accredited2026Log())

      const validated = await upload(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([linkedRow({ exportDate: '2026-12-28' })])
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        expect.objectContaining({
          errorCode: 'DATE_BEFORE_SUMMARY_LOG_YEAR',
          actual: '2026-12-28',
          location: expect.objectContaining({
            header: 'DATE_OF_EXPORT',
            rowId: '1001'
          })
        })
      ])
    })

    it.each([
      ['as text', '2026-12-28'],
      ['as a date cell', new Date('2026-12-28T00:00:00.000Z')]
    ])(
      'accepts a 2026 export date supplied on a linked row that repeats the 2026 row, stored %s',
      async (_, exportDate) => {
        uploadOn('2027-01-10T09:00:00.000Z')
        const env = await setup()
        await submitted(
          env,
          PREVIOUS_YEAR,
          'log-2026',
          accredited2026Log({
            ...EXPORTED_IN_JANUARY_2027,
            exportDate,
            dateReceivedByOsr: null
          })
        )

        const validated = await upload(
          env,
          YEAR,
          'log-2027',
          accredited2027Log([linkedRow({ exportDate: '2026-12-28' })])
        )

        expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      }
    )

    it('completes a 2026 row whose refused and stopped were left on Choose option with a supplied No', async () => {
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log({
          wasteRefused: 'Choose option',
          wasteStopped: 'Choose option'
        })
      )

      await submitted(env, YEAR, 'log-2027', accredited2027Log([linkedRow()]))

      const row = await storedRow(env, ledgerIdOf(env), 'log-2027', '1001')
      expect(row?.data).toEqual(
        expect.objectContaining({
          WAS_THE_WASTE_REFUSED: 'No',
          WAS_THE_WASTE_STOPPED: 'No'
        })
      )
      expect(row?.link?.suppliedFields).toEqual(
        expect.arrayContaining([
          'WAS_THE_WASTE_REFUSED',
          'WAS_THE_WASTE_STOPPED'
        ])
      )
    })

    it('stores a row as written when its previous-year row ID names no 2026 row', async () => {
      const env = await setup()
      await submitted(env, PREVIOUS_YEAR, 'log-2026', accredited2026Log())

      await submitted(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          { rowId: 1001, previousYearRowId: 1999, exportTonnage: 100 }
        ])
      )

      const row = await storedRow(env, ledgerIdOf(env), 'log-2027', '1001')
      expect(row?.data.DATE_RECEIVED_FOR_EXPORT).toBe('2027-01-15')
      expect(row).not.toHaveProperty('link')
    })

    it('keeps a 2026 PRN on a linked row whose PRN column is left on its No default', async () => {
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log({ prnIssued: 'Yes' })
      )

      await submitted(env, YEAR, 'log-2027', accredited2027Log([linkedRow()]))

      expect(
        (await storedRow(env, ledgerIdOf(env), 'log-2027', '1001'))
          ?.classification
      ).toEqual(
        expect.objectContaining({
          outcome: 'EXCLUDED',
          reasons: [{ code: 'PRN_ISSUED' }]
        })
      )
      expect((await getWasteBalance(env)).amount).toBe(0)
    })
  })

  describe('a registered-only exporter', () => {
    const exportedRow = {
      ROW_ID: 2001,
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 9.5,
      DATE_OF_EXPORT: '2026-12-20T00:00:00.000Z',
      OSR_ID: 100,
      BASEL_EXPORT_CODE: 'B3020',
      WAS_THE_WASTE_REFUSED: null,
      WAS_THE_WASTE_STOPPED: null,
      DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: null,
      OSR_NAME: 'Overseas Reprocessor A',
      OSR_COUNTRY: 'Vietnam-VN',
      CUSTOMS_CODES: '123456',
      CONTAINER_NUMBER: 'CONT123456'
    }

    it('fills in the export from the 2026 row and keeps the supplied refusal', async () => {
      openNextYear()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        accredited: false,
        year: YEAR
      })
      await submitted(env, PREVIOUS_YEAR, 'log-2026', {
        meta: createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
        data: { LOADS_EXPORTED: tableOf('Exported', [exportedRow]) }
      })

      await submitted(env, YEAR, 'log-2027', {
        meta: withTemplateYear(
          createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
          YEAR
        ),
        data: {
          LOADS_EXPORTED: tableOf('Exported', [
            {
              ...exportedRow,
              TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 1,
              DATE_OF_EXPORT: '2027-01-05T00:00:00.000Z',
              OSR_ID: null,
              WAS_THE_WASTE_REFUSED: 'Yes',
              PREVIOUS_YEAR_ROW_ID: 2001,
              EXIT_PORT: null,
              DWT_EXPORT_ID: null
            }
          ])
        }
      })

      const row = await storedRow(
        env,
        ledgerIdOf({ ...env, accreditationNumber: null }),
        'log-2027',
        '2001'
      )
      expect(row?.data).toEqual(
        expect.objectContaining({
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 9.5,
          DATE_OF_EXPORT: '2026-12-20T00:00:00.000Z',
          OSR_ID: 100,
          WAS_THE_WASTE_REFUSED: 'Yes'
        })
      )
      expect(row?.link).toEqual(
        expect.objectContaining({
          year: PREVIOUS_YEAR,
          rowId: '2001',
          suppliedFields: ['WAS_THE_WASTE_REFUSED']
        })
      )
    })
  })
})
