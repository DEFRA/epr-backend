import { StatusCodes } from 'http-status-codes'
import { http, HttpResponse } from 'msw'
import { onTestFinished } from 'vitest'

import { aggregateTonnageByMaterial } from '#application/tonnage-monitoring/aggregate-tonnage.js'
import { toYearMonth, yearOf } from '#common/helpers/dates/year-month.js'
import { toYear } from '#common/helpers/dates/year.js'
import { MATERIAL } from '#domain/organisations/model.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { aggregateWasteBalanceTable } from '#market-insights/application/waste-balance-table.js'
import { asOperator, asServiceMaintainer } from '#test/inject-auth.js'
import { DATABASE_NAME, it as mongoIt } from '#vite/fixtures/mongo-client.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { buildCreditedTonnageReport } from '#waste-balances/application/credited-tonnage-report.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createMongoSummaryLogRowStatesRepository } from '#waste-records/repository/mongodb.js'
import { createTonnageQuery } from '#waste-records/repository/tonnage-query.mongodb.js'

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

const EXPORTED_IN_DECEMBER_2026 = {
  ...EXPORTED_IN_JANUARY_2027,
  exportTonnage: 25,
  exportDate: '2026-12-28',
  dateReceivedByOsr: null
}

const RECEIVED_OVERSEAS_IN_2027 = {
  exportTonnage: null,
  exportDate: null,
  dateReceivedByOsr: '2027-01-06'
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

/** Until then, a 2027 row may not carry a 2026 date it was not linked to. */
const afterThe2026CorrectionDeadline = () => {
  vi.useFakeTimers({
    toFake: ['Date'],
    now: new Date('2027-03-15T10:00:00.000Z')
  })
  onTestFinished(() => {
    vi.useRealTimers()
  })
}

/**
 * Each exported row's ID and waste balance cells, read through the
 * registration's waste-records export.
 *
 * @param {Awaited<ReturnType<typeof setupWasteBalanceIntegrationEnvironment>>} env
 * @param {import('#common/helpers/dates/year.js').Year} year
 */
const exportedBalanceCells = async (env, year) => {
  const response = await env.server.inject({
    method: 'GET',
    url: `/organisations/${env.organisationNumber}/registrations/${env.registrationNumber}/waste-records/export.csv?year=${year}`,
    ...asServiceMaintainer()
  })
  expect(response.statusCode).toBe(StatusCodes.OK)
  const [header, ...rows] = response.payload
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split(','))
  const columns = [
    'Row ID',
    'Included in Waste Balance',
    'Waste Balance Tonnage',
    'Waste Balance Exclusion Reason'
  ].map((name) => header.indexOf(name))
  return rows.map((cells) => columns.map((column) => cells[column]))
}

const storedRow = async (env, ledgerId, summaryLogId, rowId) => {
  const rows =
    await env.summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
      ledgerId,
      toSummaryLogFileId(`file-${summaryLogId}`)
    )
  return rows.find((row) => row.rowId === rowId)
}

/**
 * @template {{ year: import('#common/helpers/dates/year.js').Year }} Env
 * @param {Env} env
 * @returns {Env}
 */
const previousYearOf = (env) => ({
  ...env,
  year: PREVIOUS_YEAR,
  accreditationNumber: PREVIOUS_YEAR_ACCREDITATION_NUMBER
})

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
    /** @param {Parameters<typeof setupWasteBalanceIntegrationEnvironment>[0]} [repositories] */
    const setup = async (repositories = {}) => {
      openNextYear()
      return setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: YEAR,
        previousYearAccreditationNumber: PREVIOUS_YEAR_ACCREDITATION_NUMBER,
        ...repositories
      })
    }

    mongoIt(
      'counts a load exported in December 2026 once in tonnage monitoring, in 2026, when a 2027 row is filled in from it',
      async ({ mongoClient }) => {
        vi.useFakeTimers({
          toFake: ['Date'],
          now: new Date('2027-01-20T10:00:00.000Z')
        })
        onTestFinished(() => {
          vi.useRealTimers()
        })
        const db = mongoClient.db(DATABASE_NAME)
        const env = await setup({
          ledgerRepository: (await createMongoLedgerRepository(db))(),
          summaryLogRowStatesRepository: (
            await createMongoSummaryLogRowStatesRepository(db)
          )()
        })
        await submitted(
          env,
          PREVIOUS_YEAR,
          'log-2026',
          accredited2026Log(EXPORTED_IN_DECEMBER_2026)
        )

        await submitted(
          env,
          YEAR,
          'log-2027',
          accredited2027Log([
            linkedRow({ exportTonnage: null, exportDate: null })
          ])
        )

        expect(
          (await storedRow(env, ledgerIdOf(env), 'log-2027', '1001'))?.data
        ).toEqual(
          expect.objectContaining({
            DATE_OF_EXPORT: '2026-12-28',
            TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 25
          })
        )

        /** @param {import('#common/helpers/dates/year.js').Year} year */
        const tonnageMonitoring = (year) =>
          aggregateTonnageByMaterial(
            createTonnageQuery(db),
            env.ledgerRepository,
            env.organisationReadRepository,
            year
          )
        const report2026 = await tonnageMonitoring(PREVIOUS_YEAR)
        expect(
          report2026.materials
            .find(
              ({ material, type }) =>
                material === MATERIAL.PAPER && type === 'Exporter'
            )
            ?.months.find(({ month }) => month === 'Dec')
        ).toEqual({ month: 'Dec', tonnage: 25 })
        expect(report2026.total).toBe(25)
        expect((await tonnageMonitoring(YEAR)).total).toBe(0)
      }
    )

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

    it('reports a load received in December 2026 in that month and its January 2027 export in January 2027', async () => {
      vi.useFakeTimers({
        toFake: ['Date'],
        now: new Date('2027-02-15T10:00:00.000Z')
      })
      onTestFinished(() => {
        vi.useRealTimers()
      })
      const env = await setup()
      await submitted(env, PREVIOUS_YEAR, 'log-2026', accredited2026Log())
      await submitted(env, YEAR, 'log-2027', accredited2027Log([linkedRow()]))

      /**
       * @param {import('#common/helpers/dates/year.js').Year} year
       * @param {number} month
       */
      const monthlyReport = async (year, month) => {
        const response = await env.server.inject({
          method: 'GET',
          url: `/organisations/${env.organisationNumber}/registrations/${env.registrationNumber}/accreditations/${year}/reports/monthly/${month}/submissions/1`,
          ...asOperator()
        })
        expect(response.statusCode).toBe(StatusCodes.OK)
        const { recyclingActivity, exportActivity } = JSON.parse(
          response.payload
        )
        return {
          received: recyclingActivity.totalTonnageReceived,
          exported: exportActivity.totalTonnageExported
        }
      }

      expect(await monthlyReport(PREVIOUS_YEAR, 12)).toEqual({
        received: 850,
        exported: 0
      })
      expect(await monthlyReport(YEAR, 1)).toEqual({
        received: 0,
        exported: 100
      })
      expect((await getWasteBalance(env)).amount).toBe(100)
    })

    it('credits a load exported in December 2026 and received overseas in 2027 to the 2027 balance only', async () => {
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log(EXPORTED_IN_DECEMBER_2026)
      )

      await submitted(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([linkedRow(RECEIVED_OVERSEAS_IN_2027)])
      )

      expect(
        (await storedRow(env, ledgerIdOf(env), 'log-2027', '1001'))
          ?.classification
      ).toEqual(
        expect.objectContaining({ outcome: 'INCLUDED', transactionAmount: 25 })
      )
      expect((await getWasteBalance(env)).amount).toBe(25)
      expect((await getWasteBalance(previousYearOf(env))).amount).toBe(0)
    })

    it('does not credit a load exported in December 2026 and refused on a linked 2027 row', async () => {
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log({
          ...EXPORTED_IN_DECEMBER_2026,
          wasteRefused: null,
          wasteStopped: null
        })
      )

      await submitted(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          linkedRow({
            ...RECEIVED_OVERSEAS_IN_2027,
            wasteRefused: 'Yes',
            wasteStopped: 'No'
          })
        ])
      )

      expect(
        (await storedRow(env, ledgerIdOf(env), 'log-2027', '1001'))
          ?.classification
      ).toEqual(
        expect.objectContaining({
          outcome: 'EXCLUDED',
          reasons: [{ code: 'WASTE_REFUSED' }]
        })
      )
      expect((await getWasteBalance(env)).amount).toBe(0)
    })

    it('does not credit a linked row exported on a day the 2026 accreditation was suspended', async () => {
      const env = await setup({
        previousYearAccreditationSuspendedOn: '2026-12-20'
      })
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log(EXPORTED_IN_DECEMBER_2026)
      )

      await submitted(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([linkedRow(RECEIVED_OVERSEAS_IN_2027)])
      )

      expect(
        (await storedRow(env, ledgerIdOf(env), 'log-2027', '1001'))
          ?.classification
      ).toEqual(
        expect.objectContaining({
          outcome: 'IGNORED',
          reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }]
        })
      )
      expect((await getWasteBalance(env)).amount).toBe(0)
    })

    it('does not credit a linked row exported before the 2026 accreditation started', async () => {
      const env = await setup({
        previousYearAccreditationValidFrom: '2026-12-29'
      })
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log(EXPORTED_IN_DECEMBER_2026)
      )

      await submitted(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([linkedRow(RECEIVED_OVERSEAS_IN_2027)])
      )

      expect(
        (await storedRow(env, ledgerIdOf(env), 'log-2027', '1001'))
          ?.classification
      ).toEqual(
        expect.objectContaining({
          outcome: 'IGNORED',
          reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }]
        })
      )
      expect((await getWasteBalance(env)).amount).toBe(0)
    })

    it('credits an unlinked 2027 row, uploaded once 2026 has closed, exported on a live day of the 2026 accreditation', async () => {
      afterThe2026CorrectionDeadline()
      const env = await setup()

      await submitted(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          { rowId: 1001, exportDate: '2026-12-28', exportTonnage: 100 }
        ])
      )

      expect((await getWasteBalance(env)).amount).toBe(100)
    })

    describe('a load exported in December 2026 and received overseas in 2027, read again by', () => {
      const submittedAcrossTheYearEnd = async () => {
        const env = await setup()
        await submitted(
          env,
          PREVIOUS_YEAR,
          'log-2026',
          accredited2026Log(EXPORTED_IN_DECEMBER_2026)
        )
        await submitted(
          env,
          YEAR,
          'log-2027',
          accredited2027Log([linkedRow(RECEIVED_OVERSEAS_IN_2027)])
        )
        return env
      }

      it('the waste records export, as counting towards 2027 and not 2026', async () => {
        const env = await submittedAcrossTheYearEnd()

        expect(await exportedBalanceCells(env, YEAR)).toEqual([
          ['1001', 'true', '25', '']
        ])
        expect(await exportedBalanceCells(env, PREVIOUS_YEAR)).toEqual([
          ['1500', 'false', '', 'MISSING_REQUIRED_FIELD: DATE_RECEIVED_BY_OSR']
        ])
      })

      it('the market insights waste balance, once, in January 2027', async () => {
        const env = await submittedAcrossTheYearEnd()

        /** @param {import('#common/helpers/dates/year-month.js').YearMonth} month */
        const publishedExporterCredit = async (month) => {
          const table = await aggregateWasteBalanceTable({
            ledgerRepository: env.ledgerRepository,
            summaryLogRowStatesRepository: env.summaryLogRowStatesRepository,
            organisationReadRepository: env.organisationReadRepository,
            reportsRepository: env.reportsRepository,
            logger: env.logger,
            year: yearOf(month),
            months: [month],
            now: new Date('2027-02-01T00:00:00.000Z')
          })
          const { totalCredited, eligibleForWasteBalance } =
            table.data.months[month].figures.paper.exporter
          return { totalCredited, eligibleForWasteBalance }
        }

        expect(await publishedExporterCredit(toYearMonth('2027-01'))).toEqual({
          totalCredited: 25,
          eligibleForWasteBalance: 25
        })
        expect(await publishedExporterCredit(toYearMonth('2026-12'))).toEqual({
          totalCredited: 0,
          eligibleForWasteBalance: 0
        })
      })

      it('the credited tonnage report, once', async () => {
        const env = await submittedAcrossTheYearEnd()

        const report = await buildCreditedTonnageReport({
          ledgerRepository: env.ledgerRepository,
          summaryLogRowStatesRepository: env.summaryLogRowStatesRepository,
          organisationReadRepository: env.organisationReadRepository,
          logger: env.logger,
          now: new Date('2027-02-01T00:00:00.000Z')
        })

        expect(
          report.data
            .filter(({ tonnage }) => tonnage.totalCredited !== 0)
            .map(({ month, accreditation, tonnage }) => ({
              month,
              accreditationNumber: accreditation.accreditationNumber,
              totalCredited: tonnage.totalCredited,
              eligibleForWasteBalance: tonnage.eligibleForWasteBalance
            }))
        ).toEqual([
          {
            month: '2027-01',
            accreditationNumber: env.accreditationNumber,
            totalCredited: 25,
            eligibleForWasteBalance: 25
          }
        ])
      })
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

    it('passes a linked row whose 2026 tonnage was entered to more than two decimal places and credits it', async () => {
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log({
          grossWeight: 12.123,
          tareWeight: 1,
          palletWeight: 1,
          netWeight: 10.123,
          recyclablePropMethod: 'Actual weight (100%)',
          nonTargetWeight: 0,
          recyclablePropPct: 0.37,
          tonnageReceived: 3.74551
        })
      )

      const validated = await upload(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([linkedRow({ exportTonnage: 3.7 })])
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      expect((await submitAndWait(env, 'log-2027')).status).toBe(
        SUMMARY_LOG_STATUS.SUBMITTED
      )
      expect((await getWasteBalance(env)).amount).toBe(3.7)
    })

    it('rejects a row whose previous-year row ID names no 2026 row, on that cell', async () => {
      const env = await setup()
      await submitted(env, PREVIOUS_YEAR, 'log-2026', accredited2026Log())

      const validated = await upload(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          { rowId: 1001, previousYearRowId: 1999, exportTonnage: 100 }
        ])
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        {
          code: 'PREVIOUS_YEAR_LINK',
          errorCode: 'PREVIOUS_YEAR_ROW_NOT_FOUND',
          actual: 1999,
          expected: 2026,
          location: expect.objectContaining({
            sheet: 'Exported (sections 1, 2 and 3)',
            table: 'RECEIVED_LOADS_FOR_EXPORT',
            row: 8,
            rowId: '1001',
            header: 'PREVIOUS_YEAR_ROW_ID'
          })
        }
      ])
      expect(
        await storedRow(env, ledgerIdOf(env), 'log-2027', '1001')
      ).toBeUndefined()
    })

    it('rejects every linked row when no 2026 log was submitted', async () => {
      const env = await setup()

      const validated = await upload(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          linkedRow(),
          linkedRow({ rowId: 1002, previousYearRowId: 1501 })
        ])
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(
        validated.validation.failures.map(({ errorCode, location }) => [
          errorCode,
          location.rowId
        ])
      ).toStrictEqual([
        ['PREVIOUS_YEAR_ROW_NOT_FOUND', '1001'],
        ['PREVIOUS_YEAR_ROW_NOT_FOUND', '1002']
      ])
    })

    it('rejects a link to a 2026 load received overseas, on its received date left blank', async () => {
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log({
          ...EXPORTED_IN_DECEMBER_2026,
          dateReceivedByOsr: '2026-12-30'
        })
      )

      const validated = await upload(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          linkedRow({
            exportTonnage: null,
            exportDate: null,
            dateReceivedByOsr: null
          })
        ])
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        {
          code: 'PREVIOUS_YEAR_LINK',
          errorCode: 'PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR',
          actual: null,
          expected: 2026,
          previousYearRowId: '1500',
          location: expect.objectContaining({
            rowId: '1001',
            header: 'DATE_RECEIVED_BY_OSR'
          })
        }
      ])
      expect(
        await storedRow(env, ledgerIdOf(env), 'log-2027', '1001')
      ).toBeUndefined()
    })

    it('rejects a link to a 2026 load refused and repatriated, on its repatriation date', async () => {
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accredited2026Log({
          ...EXPORTED_IN_DECEMBER_2026,
          wasteRefused: 'Yes',
          dateRepatriated: '2026-12-31'
        })
      )

      const validated = await upload(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          linkedRow({
            exportTonnage: null,
            exportDate: null,
            dateReceivedByOsr: null,
            wasteRefused: null,
            wasteStopped: null
          })
        ])
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        expect.objectContaining({
          errorCode: 'PREVIOUS_YEAR_ROW_REPATRIATED',
          previousYearRowId: '1500',
          location: expect.objectContaining({
            header: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
          })
        })
      ])
    })

    it('rejects a row that names a 2026 row but has no row ID', async () => {
      const env = await setup()
      await submitted(env, PREVIOUS_YEAR, 'log-2026', accredited2026Log())

      const validated = await upload(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([linkedRow({ rowId: null })])
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        expect.objectContaining({
          code: 'FIELD_REQUIRED',
          location: expect.objectContaining({ header: 'ROW_ID' })
        })
      ])
    })

    it('checks the tonnage of a row whose link names no 2026 row exactly, as typed', async () => {
      const env = await setup()
      await submitted(env, PREVIOUS_YEAR, 'log-2026', accredited2026Log())

      const validated = await upload(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          { rowId: 1001, previousYearRowId: 1999, tonnageReceived: 850.01 }
        ])
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toContainEqual(
        expect.objectContaining({ code: 'CALCULATED_VALUE_MISMATCH' })
      )
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

  describe('an accredited exporter also accredited in 2025, on the 2026 template', () => {
    it('does not credit a 2026 row exported in 2025, at submission or in the waste records export', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: PREVIOUS_YEAR,
        previousYearAccreditationNumber: toAccreditationNumber('ACC-121')
      })

      await submitted(env, PREVIOUS_YEAR, 'log-2026', {
        meta: createWasteBalanceMeta('EXPORTER'),
        data: accredited2026Log({
          ...EXPORTED_IN_JANUARY_2027,
          dateReceived: '2025-12-10T00:00:00.000Z',
          exportDate: '2025-12-28',
          dateReceivedByOsr: '2026-01-06'
        }).data
      })

      expect(
        (await storedRow(env, ledgerIdOf(env), 'log-2026', '1500'))
          ?.classification.reasons
      ).toEqual([{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }])
      expect(await exportedBalanceCells(env, PREVIOUS_YEAR)).toEqual([
        ['1500', 'false', '', 'OUTSIDE_ACCREDITATION_PERIOD']
      ])
    })
  })

  describe('an accredited exporter accredited only in 2027', () => {
    it('does not credit a 2027 row, uploaded once 2026 has closed, exported in 2026', async () => {
      afterThe2026CorrectionDeadline()
      openNextYear()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: YEAR
      })

      await submitted(
        env,
        YEAR,
        'log-2027',
        accredited2027Log([
          { rowId: 1001, exportDate: '2026-12-28', exportTonnage: 100 }
        ])
      )

      expect(
        (await storedRow(env, ledgerIdOf(env), 'log-2027', '1001'))
          ?.classification
      ).toEqual(
        expect.objectContaining({
          outcome: 'IGNORED',
          reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }]
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
          PREVIOUS_YEAR_ROW_ID: 2001,
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

    /** @param {Record<string, unknown>} [row] */
    const registeredOnly2027Log = (row = {}) => ({
      meta: withTemplateYear(
        createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
        YEAR
      ),
      data: {
        LOADS_EXPORTED: tableOf('Exported', [
          {
            ...exportedRow,
            ROW_ID: 2002,
            PREVIOUS_YEAR_ROW_ID: 2001,
            EXIT_PORT: null,
            DWT_EXPORT_ID: null,
            ...row
          }
        ])
      }
    })

    /** @param {Record<string, unknown>} [previousYearRow] */
    const setupWith2026Row = async (previousYearRow = {}) => {
      openNextYear()
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        accredited: false,
        year: YEAR
      })
      await submitted(env, PREVIOUS_YEAR, 'log-2026', {
        meta: createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
        data: {
          LOADS_EXPORTED: tableOf('Exported', [
            { ...exportedRow, ...previousYearRow }
          ])
        }
      })
      return env
    }

    it('rejects a row whose previous-year row ID names no 2026 row', async () => {
      const env = await setupWith2026Row()

      const validated = await upload(
        env,
        YEAR,
        'log-2027',
        registeredOnly2027Log({
          PREVIOUS_YEAR_ROW_ID: 2999,
          DATE_OF_EXPORT: '2027-01-05T00:00:00.000Z'
        })
      )

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(validated.validation.failures).toStrictEqual([
        expect.objectContaining({
          errorCode: 'PREVIOUS_YEAR_ROW_NOT_FOUND',
          actual: 2999,
          location: expect.objectContaining({
            table: 'LOADS_EXPORTED',
            rowId: '2002',
            header: 'PREVIOUS_YEAR_ROW_ID'
          })
        })
      ])
    })

    it.each([
      [
        'neither refused nor stopped, on the previous year Row ID entered',
        { WAS_THE_WASTE_REFUSED: 'No', WAS_THE_WASTE_STOPPED: 'No' },
        'PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR',
        'PREVIOUS_YEAR_ROW_ID',
        2001
      ],
      [
        'stopped and repatriated, on its repatriation date',
        {
          WAS_THE_WASTE_REFUSED: 'No',
          WAS_THE_WASTE_STOPPED: 'Yes',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-12-30T00:00:00.000Z'
        },
        'PREVIOUS_YEAR_ROW_REPATRIATED',
        'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED',
        null
      ]
    ])(
      'rejects a link to a 2026 load %s',
      async (_, previousYearRow, errorCode, header, actual) => {
        const env = await setupWith2026Row(previousYearRow)

        const validated = await upload(
          env,
          YEAR,
          'log-2027',
          registeredOnly2027Log()
        )

        expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
        expect(validated.validation.failures).toStrictEqual([
          expect.objectContaining({
            code: 'PREVIOUS_YEAR_LINK',
            errorCode,
            actual,
            previousYearRowId: '2001',
            location: expect.objectContaining({ rowId: '2002', header })
          })
        ])
        expect(
          await storedRow(
            env,
            ledgerIdOf({ ...env, accreditationNumber: null }),
            'log-2027',
            '2002'
          )
        ).toBeUndefined()
      }
    )
  })
})
