import { describe, it, expect, vi } from 'vitest'
import {
  ACCREDITATION_STATUS,
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REGISTRATION_STATUS,
  REGULATOR,
  REPROCESSING_TYPE,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { seedInFlightResubmission } from '#vite/helpers/seed-inflight-resubmission.js'
import { partialMock } from '#test/type-helpers.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { noMeasures } from '#market-insights/domain/reprocessor-exporter-figures.js'
import { buildReprocessorExporterTable } from './reprocessor-exporter-table.js'

const NOW = new Date('2026-04-15T12:00:00.000Z')

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

// .vite/setup-files.js configures 999999 as a test organisation.
const TEST_ORG_ID = 999999

const approvedHistory = [
  { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
  { status: ACCREDITATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
]

/**
 * A 24-hex id the reports store accepts, distinct per prefix and operator.
 *
 * @param {string} prefix - one hex character
 * @param {number} orgId
 */
const objectIdFor = (prefix, orgId) => `${prefix}${orgId}`.padStart(24, '0')

/**
 * An accredited operator with one registration.
 *
 * @param {{
 *   orgId: number,
 *   material?: import('#domain/organisations/model.js').AppliedForMaterial,
 *   glassRecyclingProcess?: import('#domain/organisations/model.js').GlassRecyclingProcess[],
 *   wasteProcessingType?: import('#domain/organisations/model.js').WasteProcessingTypeValue,
 *   regulator?: import('#domain/organisations/model.js').RegulatorValue,
 *   accreditationRegulator?: import('#domain/organisations/model.js').RegulatorValue,
 *   registrationStatusHistory?: { status: import('#domain/organisations/model.js').RegistrationStatus, updatedAt: string }[]
 *   accreditationStatusHistory?: { status: import('#domain/organisations/model.js').AccreditationStatus, updatedAt: string }[]
 *   validFrom?: string
 * }} options
 */
const makeOperator = ({
  orgId,
  material = MATERIAL.PLASTIC,
  glassRecyclingProcess,
  wasteProcessingType = WASTE_PROCESSING_TYPE.REPROCESSOR,
  regulator = REGULATOR.EA,
  accreditationRegulator = regulator,
  registrationStatusHistory = approvedHistory,
  accreditationStatusHistory = approvedHistory,
  validFrom = '2026-01-01'
}) => {
  const id = objectIdFor('a', orgId)
  const registrationId = objectIdFor('b', orgId)
  const accreditationId = `acc-${orgId}`

  return {
    id,
    orgId,
    statusHistory: approvedHistory,
    registrations: [
      {
        id: registrationId,
        accreditationId,
        statusHistory: registrationStatusHistory,
        material,
        glassRecyclingProcess,
        wasteProcessingType,
        reprocessingType: REPROCESSING_TYPE.INPUT,
        submittedToRegulator: regulator
      }
    ],
    accreditations: [
      {
        id: accreditationId,
        accreditationNumber: `ACC-${orgId}`,
        status: accreditationStatusHistory.at(-1)?.status,
        statusHistory: accreditationStatusHistory,
        validFrom,
        validTo: '2026-12-31',
        material,
        wasteProcessingType,
        submittedToRegulator: accreditationRegulator
      }
    ]
  }
}

/**
 * The PRN figures an operator submits. The average price is whatever the
 * operator's own report carries; the published figures never read it.
 *
 * @param {number} issuedTonnage
 * @param {number} freeTonnage
 * @param {number} totalRevenue
 * @param {number} [averagePricePerTonne]
 */
const prn = (
  issuedTonnage,
  freeTonnage,
  totalRevenue,
  averagePricePerTonne = 999999
) => ({
  issuedTonnage,
  freeTonnage,
  totalRevenue,
  averagePricePerTonne
})

/**
 * A monthly report an operator submitted for one period of 2026, carrying the
 * given figures.
 *
 * @param {ReturnType<typeof makeOperator>} operator
 * @param {number} period
 * @param {Partial<import('#reports/repository/port.js').CreateReportParams>} figures
 */
const monthlyReport = (operator, period, figures = {}) => ({
  organisationId: operator.id,
  registrationId: operator.registrations[0].id,
  year: 2026,
  cadence: 'monthly',
  period,
  ...figures
})

/**
 * Run the aggregation over in-memory adapters seeded with the given operators
 * and reports.
 *
 * @param {{
 *   organisations: any[],
 *   reports?: ReturnType<typeof monthlyReport>[],
 *   inFlightResubmissions?: ReturnType<typeof monthlyReport>[],
 *   months?: import('#common/helpers/dates/year-month.js').YearMonth[],
 *   regulator?: import('#domain/organisations/model.js').RegulatorValue
 * }} options
 */
const run = async ({
  organisations,
  reports = [],
  inFlightResubmissions = [],
  months = JANUARY_TO_MARCH_2026,
  regulator
}) => {
  const seededReports = createInMemoryReportsRepository()()
  for (const report of reports) {
    await buildSubmittedReport(seededReports, report)
  }
  for (const report of inFlightResubmissions) {
    await seedInFlightResubmission(seededReports, report)
  }
  /** @type {import('#reports/repository/port.js').ReportsRepository} */
  const reportsRepository = {
    ...seededReports,
    findAllPeriodicReports: async () => {
      throw new Error(
        'reprocessor and exporter table read every periodic report'
      )
    }
  }

  const logger = { info: vi.fn(), warn: vi.fn() }
  const table = await buildReprocessorExporterTable({
    organisationsRepository: createInMemoryOrganisationsRepository(
      organisations.map((organisation) => partialMock(organisation))
    )(),
    reportsRepository,
    logger: partialMock(logger),
    year: 2026,
    months,
    regulator,
    now: NOW
  })
  return { table, logger }
}

/**
 * @param {Record<string, number>} figures
 */
const withNoOperators = (figures) => ({
  ...figures,
  operatorCount: 0,
  submittingOperatorCount: 0,
  contributingOperatorCounts: Object.fromEntries(
    Object.keys(figures).map((figure) => [figure, 0])
  )
})

const NO_REPROCESSOR_ACTIVITY = withNoOperators({
  ...noMeasures(WASTE_PROCESSING_TYPE.REPROCESSOR),
  tonnageSentOnTotal: 0,
  averagePricePerTonne: 0
})

const NO_EXPORTER_ACTIVITY = withNoOperators({
  ...noMeasures(WASTE_PROCESSING_TYPE.EXPORTER),
  tonnageSentOnTotal: 0,
  averagePricePerTonne: 0
})

/**
 * The cells something was reported into, flattened to one row each, without
 * their operator counts. The table carries a zero cell for every other
 * combination, which these tests are not about.
 *
 * @param {import('./reprocessor-exporter-table.js').ReprocessorExporterTable} table
 */
const reported = (table) =>
  Object.entries(table.data.months).flatMap(([month, { figures }]) =>
    Object.entries(figures).flatMap(([material, byAccreditationType]) =>
      Object.entries(byAccreditationType)
        .map(
          ([
            accreditationType,
            {
              operatorCount: _operators,
              submittingOperatorCount: _submitting,
              contributingOperatorCounts: _contributing,
              ...measures
            }
          ]) => ({ accreditationType, measures })
        )
        .filter(({ measures }) =>
          Object.values(measures).some((measure) => measure !== 0)
        )
        .map(({ accreditationType, measures }) => ({
          material,
          accreditationType,
          month,
          ...measures
        }))
    )
  )

/**
 * One of the operator counts of every cell where it is not zero, keyed
 * `month material type`.
 *
 * @param {import('./reprocessor-exporter-table.js').ReprocessorExporterTable} table
 * @param {'operatorCount' | 'submittingOperatorCount'} [count]
 */
const operatorCounts = (table, count = 'operatorCount') =>
  Object.fromEntries(
    Object.entries(table.data.months).flatMap(([month, { figures }]) =>
      Object.entries(figures).flatMap(([material, byAccreditationType]) =>
        Object.entries(byAccreditationType)
          .filter(([, cell]) => cell[count] !== 0)
          .map(([accreditationType, cell]) => [
            `${month} ${material} ${accreditationType}`,
            cell[count]
          ])
      )
    )
  )

/**
 * @param {import('./reprocessor-exporter-table.js').ReprocessorExporterTable} table
 */
const submittingOperatorCounts = (table) =>
  operatorCounts(table, 'submittingOperatorCount')

/**
 * The reports each month was owed and how many arrived, and the same for the
 * period.
 *
 * @param {import('./reprocessor-exporter-table.js').ReprocessorExporterTable} table
 */
const coverage = (table) => ({
  byMonth: Object.fromEntries(
    Object.entries(table.data.months).map(([month, { reports }]) => [
      month,
      reports
    ])
  ),
  period: table.data.period.reports
})

/**
 * The PRN tonnage the January reprocessor table totals to.
 *
 * @param {import('./reprocessor-exporter-table.js').ReprocessorExporterTable} table
 */
const januaryIssued = (table) =>
  table.data.months['2026-01'].totals[WASTE_PROCESSING_TYPE.REPROCESSOR]
    .revisedTonnageIssued

describe('buildReprocessorExporterTable', () => {
  it('serves every month asked for, with every material and both accreditation types at zero when nothing was submitted', async () => {
    const { table } = await run({ organisations: [] })

    expect(table.meta).toEqual({ generatedAt: NOW.toISOString() })
    expect(Object.keys(table.data.months)).toEqual(JANUARY_TO_MARCH_2026)
    for (const { figures } of Object.values(table.data.months)) {
      expect(Object.keys(figures)).toEqual([...TONNAGE_MONITORING_MATERIALS])
      for (const byAccreditationType of Object.values(figures)) {
        expect(byAccreditationType).toEqual({
          [WASTE_PROCESSING_TYPE.REPROCESSOR]: NO_REPROCESSOR_ACTIVITY,
          [WASTE_PROCESSING_TYPE.EXPORTER]: NO_EXPORTER_ACTIVITY
        })
      }
    }
  })

  it('publishes a single submission as the figures of its material, type and month', async () => {
    const operator = makeOperator({ orgId: 1 })
    const { table } = await run({
      organisations: [operator],
      reports: [
        monthlyReport(operator, 2, {
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 100,
            tonnageRecycled: 80,
            tonnageNotRecycled: 20
          },
          wasteSent: {
            tonnageSentToReprocessor: 1,
            tonnageSentToExporter: 2,
            tonnageSentToAnotherSite: 3,
            finalDestinations: []
          },
          prn: prn(80, 5, 40000)
        })
      ]
    })

    expect(reported(table)).toEqual([
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        month: '2026-02',
        tonnageReceived: 100,
        tonnageRecycled: 80,
        tonnageReceivedButNotRecycled: 20,
        tonnageSentOnToReprocessor: 1,
        tonnageSentOnToExporter: 2,
        tonnageSentOnToOtherFacilities: 3,
        tonnageSentOnTotal: 6,
        revisedTonnageIssued: 75,
        totalRevenue: 40000,
        averagePricePerTonne: 533.33
      }
    ])
  })

  it('publishes an exporter submission under the exporter measures', async () => {
    const operator = makeOperator({
      orgId: 1,
      material: MATERIAL.GLASS,
      glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER],
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER
    })
    const { table } = await run({
      organisations: [operator],
      reports: [
        monthlyReport(operator, 1, {
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 200,
            tonnageRecycled: null,
            tonnageNotRecycled: null
          },
          exportActivity: {
            overseasSites: [],
            unapprovedOverseasSites: [],
            totalTonnageExported: 150,
            tonnageReceivedNotExported: 50,
            tonnageRefusedAtDestination: 5,
            tonnageStoppedDuringExport: 4,
            totalTonnageRefusedOrStopped: 9,
            tonnageRepatriated: 6
          },
          prn: prn(150, 0, 30000)
        })
      ]
    })

    expect(reported(table)).toEqual([
      {
        material: GLASS_RECYCLING_PROCESS.GLASS_OTHER,
        accreditationType: WASTE_PROCESSING_TYPE.EXPORTER,
        month: '2026-01',
        tonnageReceived: 200,
        tonnageExported: 150,
        tonnageReceivedButNotExported: 50,
        tonnageStopped: 4,
        tonnageRefused: 5,
        tonnageRepatriated: 6,
        tonnageSentOnToReprocessor: 0,
        tonnageSentOnToExporter: 0,
        tonnageSentOnToOtherFacilities: 0,
        tonnageSentOnTotal: 0,
        revisedTonnageIssued: 150,
        totalRevenue: 30000,
        averagePricePerTonne: 200
      }
    ])
  })

  it('counts a resubmitted period once, at its latest submission', async () => {
    const operator = makeOperator({ orgId: 1 })
    const { table } = await run({
      organisations: [operator],
      reports: [
        monthlyReport(operator, 1, { prn: prn(80, 5, 40000) }),
        monthlyReport(operator, 1, {
          submissionNumber: 2,
          prn: prn(120, 8, 60000)
        })
      ]
    })

    expect(reported(table)).toEqual([
      expect.objectContaining({
        month: '2026-01',
        revisedTonnageIssued: 112,
        totalRevenue: 60000
      })
    ])
  })

  it('takes the highest submission number of a period submitted three times, whatever order they were stored in', async () => {
    const operator = makeOperator({ orgId: 1 })
    const { table } = await run({
      organisations: [operator],
      reports: [
        monthlyReport(operator, 1, {
          submissionNumber: 3,
          prn: prn(300, 0, 90000)
        }),
        monthlyReport(operator, 1, { prn: prn(100, 0, 10000) }),
        monthlyReport(operator, 1, {
          submissionNumber: 2,
          prn: prn(200, 0, 50000)
        })
      ]
    })

    expect(reported(table)).toEqual([
      expect.objectContaining({
        month: '2026-01',
        revisedTonnageIssued: 300,
        totalRevenue: 90000,
        averagePricePerTonne: 300
      })
    ])
  })

  it('keeps the last submitted figures while a resubmission draft is in flight', async () => {
    const operator = makeOperator({ orgId: 1 })
    const { table } = await run({
      organisations: [operator],
      inFlightResubmissions: [
        monthlyReport(operator, 1, { prn: prn(80, 5, 40000) })
      ]
    })

    expect(reported(table)).toEqual([
      expect.objectContaining({
        month: '2026-01',
        revisedTonnageIssued: 75,
        totalRevenue: 40000
      })
    ])
  })

  it('answers zero for a material nobody reported into, beside one somebody did', async () => {
    const operator = makeOperator({ orgId: 1, material: MATERIAL.STEEL })
    const { table } = await run({
      organisations: [operator],
      reports: [monthlyReport(operator, 1, { prn: prn(10, 0, 1000) })]
    })

    expect(
      table.data.months['2026-01'].figures[MATERIAL.WOOD][
        WASTE_PROCESSING_TYPE.REPROCESSOR
      ]
    ).toEqual(NO_REPROCESSOR_ACTIVITY)
    expect(
      table.data.months['2026-01'].figures[MATERIAL.STEEL][
        WASTE_PROCESSING_TYPE.REPROCESSOR
      ]
    ).toEqual(
      expect.objectContaining({ revisedTonnageIssued: 10, totalRevenue: 1000 })
    )
  })

  it('averages by summing revenue and tonnage across operators before dividing, not by averaging their averages', async () => {
    const bigOperator = makeOperator({ orgId: 1 })
    const smallOperator = makeOperator({ orgId: 2 })
    const { table } = await run({
      organisations: [bigOperator, smallOperator],
      reports: [
        monthlyReport(bigOperator, 1, { prn: prn(900, 0, 90000, 100) }),
        monthlyReport(smallOperator, 1, { prn: prn(100, 0, 30000, 300) })
      ]
    })

    // A mean of the operators' own averages (100 and 300) would answer 200.
    expect(reported(table)).toEqual([
      expect.objectContaining({
        month: '2026-01',
        revisedTonnageIssued: 1000,
        totalRevenue: 120000,
        averagePricePerTonne: 120
      })
    ])
  })

  it('sums operators of one material and type within a month, and keeps months apart', async () => {
    const first = makeOperator({ orgId: 1 })
    const second = makeOperator({ orgId: 2 })
    const { table } = await run({
      organisations: [first, second],
      reports: [
        monthlyReport(first, 1, {
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 0.1,
            tonnageRecycled: null,
            tonnageNotRecycled: null
          }
        }),
        monthlyReport(second, 1, {
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 0.2,
            tonnageRecycled: null,
            tonnageNotRecycled: null
          }
        }),
        monthlyReport(second, 3, {
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 7,
            tonnageRecycled: null,
            tonnageNotRecycled: null
          }
        })
      ]
    })

    expect(reported(table)).toEqual([
      expect.objectContaining({ month: '2026-01', tonnageReceived: 0.3 }),
      expect.objectContaining({ month: '2026-03', tonnageReceived: 7 })
    ])
  })

  it('leaves out a month not asked for', async () => {
    const operator = makeOperator({ orgId: 1 })
    const { table } = await run({
      organisations: [operator],
      reports: [monthlyReport(operator, 4, { prn: prn(10, 0, 1000) })]
    })

    expect(reported(table)).toEqual([])
  })

  it('leaves out a quarterly report, which a registered-only operator files', async () => {
    const operator = makeOperator({ orgId: 1 })
    const { table } = await run({
      organisations: [operator],
      reports: [
        {
          ...monthlyReport(operator, 1, { prn: prn(10, 0, 1000) }),
          cadence: 'quarterly'
        }
      ]
    })

    expect(reported(table)).toEqual([])
  })

  it('leaves out the months of an accreditation since cancelled, as the regulator does', async () => {
    const operator = makeOperator({
      orgId: 1,
      accreditationStatusHistory: [
        ...approvedHistory,
        { status: ACCREDITATION_STATUS.CANCELLED, updatedAt: '2026-03-01' }
      ]
    })
    const { table, logger } = await run({
      organisations: [operator],
      reports: [monthlyReport(operator, 1, { prn: prn(10, 0, 1000) })]
    })

    expect(reported(table)).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('names the report it left out when the registration no longer resolves', async () => {
    const operator = makeOperator({
      orgId: 1,
      registrationStatusHistory: [
        { status: REGISTRATION_STATUS.CREATED, updatedAt: '2025-11-01' }
      ]
    })
    const { table, logger } = await run({
      organisations: [operator],
      reports: [monthlyReport(operator, 1, { prn: prn(10, 0, 1000) })]
    })

    expect(reported(table)).toEqual([])
    const registrationKey = `${operator.id}::${operator.registrations[0].id}`
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(registrationKey),
        event: expect.objectContaining({
          action: 'market_insights_report_unmatched',
          reference: registrationKey
        })
      })
    )
  })

  describe('the report coverage', () => {
    it('counts the monthly reports owed and received, by month and for the period', async () => {
      const operator = makeOperator({ orgId: 1 })
      const another = makeOperator({ orgId: 2, material: MATERIAL.WOOD })

      const { table } = await run({
        organisations: [operator, another],
        reports: [
          monthlyReport(operator, 1, { prn: prn(10, 0, 1000) }),
          monthlyReport(another, 1, { prn: prn(10, 0, 1000) }),
          monthlyReport(operator, 2, { prn: prn(10, 0, 1000) })
        ]
      })

      expect(coverage(table)).toEqual({
        byMonth: {
          '2026-01': { expected: 2, submitted: 2 },
          '2026-02': { expected: 2, submitted: 1 },
          '2026-03': { expected: 2, submitted: 0 }
        },
        period: { expected: 6, submitted: 3 }
      })
    })

    it('counts the registrations the figures cover and no others', async () => {
      const published = makeOperator({ orgId: 1 })
      const cancelled = makeOperator({
        orgId: 2,
        material: MATERIAL.WOOD,
        accreditationStatusHistory: [
          ...approvedHistory,
          { status: ACCREDITATION_STATUS.CANCELLED, updatedAt: '2026-03-01' }
        ]
      })
      const refused = makeOperator({
        orgId: 3,
        material: MATERIAL.STEEL,
        accreditationStatusHistory: [
          { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
          { status: ACCREDITATION_STATUS.REJECTED, updatedAt: '2025-11-20' }
        ]
      })

      const { table } = await run({
        organisations: [published, cancelled, refused],
        reports: [
          monthlyReport(published, 1, { prn: prn(10, 0, 1000) }),
          monthlyReport(cancelled, 1, { prn: prn(10, 0, 1000) }),
          monthlyReport(refused, 1, { prn: prn(10, 0, 1000) })
        ]
      })

      expect(reported(table).map(({ material }) => material)).toEqual([
        MATERIAL.PLASTIC
      ])
      expect(coverage(table).byMonth['2026-01']).toEqual({
        expected: 1,
        submitted: 1
      })
    })
  })

  it('leaves out a test organisation without remarking on it', async () => {
    const operator = makeOperator({ orgId: TEST_ORG_ID })
    const { table, logger } = await run({
      organisations: [operator],
      reports: [monthlyReport(operator, 1, { prn: prn(10, 0, 1000) })]
    })

    expect(reported(table)).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  describe('restricted to one regulator', () => {
    it('serves the registrations submitted to that regulator alone, from the aggregation that serves the UK', async () => {
      const english = makeOperator({ orgId: 1, regulator: REGULATOR.EA })
      const welsh = makeOperator({ orgId: 2, regulator: REGULATOR.NRW })
      const seeded = {
        organisations: [english, welsh],
        reports: [
          monthlyReport(english, 1, { prn: prn(100, 0, 10000) }),
          monthlyReport(welsh, 1, { prn: prn(50, 0, 5000) })
        ]
      }

      const { table: uk } = await run(seeded)
      const { table: england } = await run({
        ...seeded,
        regulator: REGULATOR.EA
      })

      expect(reported(uk)).toEqual([
        expect.objectContaining({
          month: '2026-01',
          revisedTonnageIssued: 150,
          totalRevenue: 15000
        })
      ])
      expect(reported(england)).toEqual([
        expect.objectContaining({
          month: '2026-01',
          revisedTonnageIssued: 100,
          totalRevenue: 10000
        })
      ])
    })

    it('reads the regulator off the registration, as the report-submissions extract does', async () => {
      const registeredWithEa = makeOperator({
        orgId: 1,
        regulator: REGULATOR.EA,
        accreditationRegulator: REGULATOR.NRW
      })
      const { table } = await run({
        organisations: [registeredWithEa],
        reports: [
          monthlyReport(registeredWithEa, 1, { prn: prn(10, 0, 1000) })
        ],
        regulator: REGULATOR.EA
      })

      expect(reported(table)).toEqual([
        expect.objectContaining({ month: '2026-01', revisedTonnageIssued: 10 })
      ])
    })

    it('serves four nations that add back up to the UK figures', async () => {
      const operators = Object.values(REGULATOR).map((regulator, index) =>
        makeOperator({
          orgId: index + 1,
          regulator,
          accreditationRegulator: REGULATOR.EA
        })
      )
      const seeded = {
        organisations: operators,
        reports: operators.map((operator, index) =>
          monthlyReport(operator, 1, {
            prn: prn((index + 1) * 10, 0, (index + 1) * 1000)
          })
        )
      }

      const { table: uk } = await run(seeded)
      const nations = await Promise.all(
        Object.values(REGULATOR).map(async (regulator) =>
          run({ ...seeded, regulator })
        )
      )

      expect(
        nations.reduce((total, { table }) => total + januaryIssued(table), 0)
      ).toBe(januaryIssued(uk))
      expect(januaryIssued(uk)).toBe(100)
    })

    it('counts the report coverage of that regulator alone', async () => {
      const english = makeOperator({ orgId: 1, regulator: REGULATOR.EA })
      const welsh = makeOperator({ orgId: 2, regulator: REGULATOR.NRW })
      const seeded = {
        organisations: [english, welsh],
        reports: [
          monthlyReport(english, 1, { prn: prn(100, 0, 10000) }),
          monthlyReport(welsh, 1, { prn: prn(50, 0, 5000) })
        ]
      }

      const { table: uk } = await run(seeded)
      const { table: england } = await run({
        ...seeded,
        regulator: REGULATOR.EA
      })

      expect(coverage(uk).byMonth['2026-01']).toEqual({
        expected: 2,
        submitted: 2
      })
      expect(coverage(england).byMonth['2026-01']).toEqual({
        expected: 1,
        submitted: 1
      })
      expect(coverage(england).period).toEqual({ expected: 3, submitted: 1 })
    })

    it('answers the full grid at zero when that regulator has no activity', async () => {
      const welsh = makeOperator({ orgId: 2, regulator: REGULATOR.NRW })
      const { table } = await run({
        organisations: [welsh],
        reports: [monthlyReport(welsh, 1, { prn: prn(50, 0, 5000) })],
        regulator: REGULATOR.EA
      })

      expect(reported(table)).toEqual([])
      expect(Object.keys(table.data.months)).toEqual(JANUARY_TO_MARCH_2026)
      expect(
        table.data.months['2026-01'].figures[MATERIAL.PLASTIC][
          WASTE_PROCESSING_TYPE.REPROCESSOR
        ]
      ).toEqual(NO_REPROCESSOR_ACTIVITY)
    })
  })

  describe('the operator count', () => {
    /**
     * @param {number} count
     * @param {string} [cell] - `material type`, as `operatorCounts` keys it
     */
    const everyMonth = (count, cell = 'plastic reprocessor') =>
      Object.fromEntries(
        JANUARY_TO_MARCH_2026.map((month) => [`${month} ${cell}`, count])
      )

    const cancelledThroughoutFebruary = [
      ...approvedHistory,
      { status: ACCREDITATION_STATUS.SUSPENDED, updatedAt: '2026-01-20' },
      {
        status: ACCREDITATION_STATUS.CANCELLED,
        updatedAt: '2026-01-20T09:00:00.000Z'
      },
      { status: ACCREDITATION_STATUS.APPROVED, updatedAt: '2026-03-01' }
    ]

    it('counts every operator owed a report for the month, whether or not it submitted', async () => {
      const submitting = makeOperator({ orgId: 1 })
      const silent = makeOperator({ orgId: 2 })

      const { table } = await run({
        organisations: [submitting, silent],
        reports: [monthlyReport(submitting, 1, { prn: prn(10, 0, 1000) })]
      })

      expect(operatorCounts(table)).toEqual(everyMonth(2))
    })

    it('counts the operators owed a report apart from those whose reports the figure includes', async () => {
      const operators = [1, 2, 3].map((orgId) => makeOperator({ orgId }))

      const { table } = await run({
        organisations: operators,
        reports: [monthlyReport(operators[0], 1, { prn: prn(10, 0, 1000) })]
      })

      expect(
        table.data.months['2026-01'].figures[MATERIAL.PLASTIC][
          WASTE_PROCESSING_TYPE.REPROCESSOR
        ]
      ).toEqual(
        expect.objectContaining({
          operatorCount: 3,
          submittingOperatorCount: 1
        })
      )
      expect(submittingOperatorCounts(table)).toEqual({
        '2026-01 plastic reprocessor': 1
      })
    })

    it('counts a suspended operator, which still owes its reports', async () => {
      const suspended = makeOperator({
        orgId: 1,
        accreditationStatusHistory: [
          ...approvedHistory,
          { status: ACCREDITATION_STATUS.SUSPENDED, updatedAt: '2026-01-10' }
        ]
      })

      const { table } = await run({ organisations: [suspended] })

      expect(operatorCounts(table)).toEqual(everyMonth(1))
    })

    it('leaves an operator out of a month its accreditation stood cancelled throughout', async () => {
      const reinstated = makeOperator({
        orgId: 1,
        accreditationStatusHistory: cancelledThroughoutFebruary
      })

      const { table } = await run({ organisations: [reinstated] })

      expect(operatorCounts(table)).toEqual({
        '2026-01 plastic reprocessor': 1,
        '2026-03 plastic reprocessor': 1
      })
    })

    it('counts an operator whose report the figures include for a month it was not owed', async () => {
      const early = makeOperator({ orgId: 1, validFrom: '2026-02-01' })

      const { table } = await run({
        organisations: [early],
        reports: [monthlyReport(early, 1, { prn: prn(10, 0, 1000) })]
      })

      expect(reported(table)).toEqual([
        expect.objectContaining({ month: '2026-01', revisedTonnageIssued: 10 })
      ])
      expect(operatorCounts(table)).toEqual(everyMonth(1))
      expect(
        table.data.months['2026-01'].totals[WASTE_PROCESSING_TYPE.REPROCESSOR]
          .operatorCount
      ).toBe(1)
    })

    it('counts an operator in a month it stood cancelled throughout when the figures include its report for that month', async () => {
      const reinstated = makeOperator({
        orgId: 1,
        accreditationStatusHistory: cancelledThroughoutFebruary
      })

      const { table } = await run({
        organisations: [reinstated],
        reports: [monthlyReport(reinstated, 2, { prn: prn(10, 0, 1000) })]
      })

      expect(reported(table)).toEqual([
        expect.objectContaining({ month: '2026-02', revisedTonnageIssued: 10 })
      ])
      expect(operatorCounts(table)).toEqual(everyMonth(1))
    })

    it('leaves out an operator whose accreditation the figures leave out', async () => {
      const cancelled = makeOperator({
        orgId: 1,
        accreditationStatusHistory: [
          ...approvedHistory,
          { status: ACCREDITATION_STATUS.CANCELLED, updatedAt: '2026-03-01' }
        ]
      })
      const refused = makeOperator({
        orgId: 2,
        accreditationStatusHistory: [
          { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
          { status: ACCREDITATION_STATUS.REJECTED, updatedAt: '2025-11-20' }
        ]
      })

      const { table } = await run({
        organisations: [cancelled, refused],
        reports: [
          monthlyReport(cancelled, 1, { prn: prn(10, 0, 1000) }),
          monthlyReport(refused, 1, { prn: prn(10, 0, 1000) })
        ]
      })

      expect(reported(table)).toEqual([])
      expect(operatorCounts(table)).toEqual({})
    })

    it('counts an operator with sites in two nations once in each nation and once in the UK', async () => {
      const englishSite = makeOperator({ orgId: 1, regulator: REGULATOR.EA })
      const scottishSite = makeOperator({ orgId: 2, regulator: REGULATOR.SEPA })
      const twoNations = {
        ...englishSite,
        registrations: [
          ...englishSite.registrations,
          ...scottishSite.registrations
        ],
        accreditations: [
          ...englishSite.accreditations,
          ...scottishSite.accreditations
        ]
      }
      const englishOnly = makeOperator({ orgId: 3, regulator: REGULATOR.EA })
      const seeded = {
        organisations: [twoNations, englishOnly],
        reports: [
          monthlyReport(twoNations, 1, { prn: prn(10, 0, 1000) }),
          {
            ...monthlyReport(twoNations, 1, { prn: prn(20, 0, 2000) }),
            registrationId: scottishSite.registrations[0].id
          }
        ]
      }

      const { table: uk } = await run(seeded)
      const { table: england } = await run({
        ...seeded,
        regulator: REGULATOR.EA
      })
      const { table: scotland } = await run({
        ...seeded,
        regulator: REGULATOR.SEPA
      })

      expect(operatorCounts(uk)).toEqual(everyMonth(2))
      expect(operatorCounts(england)).toEqual(everyMonth(2))
      expect(operatorCounts(scotland)).toEqual(everyMonth(1))
      const januaryOnce = { '2026-01 plastic reprocessor': 1 }
      expect(submittingOperatorCounts(uk)).toEqual(januaryOnce)
      expect(submittingOperatorCounts(england)).toEqual(januaryOnce)
      expect(submittingOperatorCounts(scotland)).toEqual(januaryOnce)
      expect(reported(uk)).toEqual([
        expect.objectContaining({ month: '2026-01', revisedTonnageIssued: 30 })
      ])
    })

    it('counts each operator once in the grand total of its accreditation type, however many materials it reports', async () => {
      const plasticAndWood = makeOperator({ orgId: 1 })
      const woodSite = makeOperator({ orgId: 2, material: MATERIAL.WOOD })
      const twoMaterials = {
        ...plasticAndWood,
        registrations: [
          ...plasticAndWood.registrations,
          ...woodSite.registrations
        ],
        accreditations: [
          ...plasticAndWood.accreditations,
          ...woodSite.accreditations
        ]
      }
      const wood = makeOperator({ orgId: 3, material: MATERIAL.WOOD })

      const { table } = await run({ organisations: [twoMaterials, wood] })
      const { totals } = table.data.months['2026-01']

      expect(operatorCounts(table)).toEqual({
        ...everyMonth(1),
        ...everyMonth(2, 'wood reprocessor')
      })
      expect(totals[WASTE_PROCESSING_TYPE.REPROCESSOR].operatorCount).toBe(2)
      expect(totals[WASTE_PROCESSING_TYPE.EXPORTER].operatorCount).toBe(0)
    })
  })

  describe('the operators contributing to each figure', () => {
    /**
     * @param {number} orgId
     * @param {import('#domain/organisations/model.js').AppliedForMaterial} [material]
     */
    const receivingOperator = (orgId, material) => {
      const operator = makeOperator({ orgId, material })
      return {
        operator,
        report: monthlyReport(operator, 1, {
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 100,
            tonnageRecycled: 100,
            tonnageNotRecycled: 0
          }
        })
      }
    }

    it('counts for each figure only the operators whose reports put something into it', async () => {
      const receiving = [1, 2, 3, 4].map((orgId) => receivingOperator(orgId))
      const issuing = makeOperator({ orgId: 5 })

      const { table } = await run({
        organisations: [...receiving.map(({ operator }) => operator), issuing],
        reports: [
          ...receiving.map(({ report }) => report),
          monthlyReport(issuing, 1, { prn: prn(10, 0, 1000) })
        ]
      })

      expect(
        table.data.months['2026-01'].figures[MATERIAL.PLASTIC][
          WASTE_PROCESSING_TYPE.REPROCESSOR
        ]
      ).toEqual(
        expect.objectContaining({
          operatorCount: 5,
          submittingOperatorCount: 5,
          contributingOperatorCounts: expect.objectContaining({
            tonnageReceived: 4,
            tonnageRecycled: 4,
            tonnageReceivedButNotRecycled: 0,
            revisedTonnageIssued: 1,
            totalRevenue: 1,
            averagePricePerTonne: 1
          })
        })
      )
    })

    it('counts toward the sent-on total whoever sent any on, and toward the average price whoever reported revenue or issued tonnage', async () => {
      const [toReprocessor, toOtherFacilities, revenueOnly, tonnageOnly] = [
        1, 2, 3, 4
      ].map((orgId) => makeOperator({ orgId }))
      /**
       * @param {number} tonnageSentToReprocessor
       * @param {number} tonnageSentToAnotherSite
       */
      const wasteSent = (
        tonnageSentToReprocessor,
        tonnageSentToAnotherSite
      ) => ({
        tonnageSentToReprocessor,
        tonnageSentToExporter: 0,
        tonnageSentToAnotherSite,
        finalDestinations: []
      })

      const { table } = await run({
        organisations: [
          toReprocessor,
          toOtherFacilities,
          revenueOnly,
          tonnageOnly
        ],
        reports: [
          monthlyReport(toReprocessor, 1, { wasteSent: wasteSent(5, 0) }),
          monthlyReport(toOtherFacilities, 1, { wasteSent: wasteSent(0, 5) }),
          monthlyReport(revenueOnly, 1, { prn: prn(0, 0, 1000) }),
          monthlyReport(tonnageOnly, 1, { prn: prn(10, 0, 0) })
        ]
      })

      expect(
        table.data.months['2026-01'].figures[MATERIAL.PLASTIC][
          WASTE_PROCESSING_TYPE.REPROCESSOR
        ].contributingOperatorCounts
      ).toEqual(
        expect.objectContaining({
          tonnageSentOnToReprocessor: 1,
          tonnageSentOnToExporter: 0,
          tonnageSentOnToOtherFacilities: 1,
          tonnageSentOnTotal: 2,
          revisedTonnageIssued: 1,
          totalRevenue: 1,
          averagePricePerTonne: 2
        })
      )
    })

    it('does not count an operator whose issued tonnage is all self-issued toward the revised tonnage', async () => {
      const selfIssuing = makeOperator({ orgId: 1 })

      const { table } = await run({
        organisations: [selfIssuing],
        reports: [monthlyReport(selfIssuing, 1, { prn: prn(10, 10, 0) })]
      })

      expect(
        table.data.months['2026-01'].figures[MATERIAL.PLASTIC][
          WASTE_PROCESSING_TYPE.REPROCESSOR
        ]
      ).toEqual(
        expect.objectContaining({
          submittingOperatorCount: 1,
          contributingOperatorCounts: expect.objectContaining({
            revisedTonnageIssued: 0,
            averagePricePerTonne: 0
          })
        })
      )
    })

    it('counts each operator once toward each figure of the grand total, however many materials it reports', async () => {
      const plastic = receivingOperator(1)
      const wood = receivingOperator(2, MATERIAL.WOOD)
      const twoMaterials = {
        ...plastic.operator,
        registrations: [
          ...plastic.operator.registrations,
          ...wood.operator.registrations
        ],
        accreditations: [
          ...plastic.operator.accreditations,
          ...wood.operator.accreditations
        ]
      }
      const issuing = makeOperator({ orgId: 3, material: MATERIAL.WOOD })

      const { table } = await run({
        organisations: [twoMaterials, issuing],
        reports: [
          plastic.report,
          { ...wood.report, organisationId: twoMaterials.id },
          monthlyReport(issuing, 1, { prn: prn(10, 0, 1000) })
        ]
      })

      expect(
        table.data.months['2026-01'].totals[WASTE_PROCESSING_TYPE.REPROCESSOR]
      ).toEqual(
        expect.objectContaining({
          operatorCount: 2,
          submittingOperatorCount: 2,
          contributingOperatorCounts: {
            tonnageReceived: 1,
            tonnageRecycled: 1,
            tonnageReceivedButNotRecycled: 0,
            tonnageSentOnTotal: 0,
            tonnageSentOnToReprocessor: 0,
            tonnageSentOnToExporter: 0,
            tonnageSentOnToOtherFacilities: 0,
            revisedTonnageIssued: 1,
            totalRevenue: 1
          }
        })
      )
    })
  })

  describe('the grand total of each table', () => {
    it('sums every material of its accreditation type, and leaves the average price out', async () => {
      const aluminium = makeOperator({ orgId: 1, material: MATERIAL.ALUMINIUM })
      const plastic = makeOperator({ orgId: 2, material: MATERIAL.PLASTIC })
      const exporter = makeOperator({
        orgId: 3,
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER
      })
      const { table } = await run({
        organisations: [aluminium, plastic, exporter],
        reports: [
          monthlyReport(aluminium, 1, { prn: prn(100, 0, 10000) }),
          monthlyReport(plastic, 1, { prn: prn(300, 0, 20000) }),
          monthlyReport(exporter, 1, { prn: prn(50, 0, 5000) })
        ]
      })

      expect(table.data.months['2026-01'].totals).toEqual({
        [WASTE_PROCESSING_TYPE.REPROCESSOR]: expect.objectContaining({
          revisedTonnageIssued: 400,
          totalRevenue: 30000
        }),
        [WASTE_PROCESSING_TYPE.EXPORTER]: expect.objectContaining({
          revisedTonnageIssued: 50,
          totalRevenue: 5000
        })
      })
      expect(
        table.data.months['2026-01'].totals[WASTE_PROCESSING_TYPE.REPROCESSOR]
      ).not.toHaveProperty('averagePricePerTonne')
    })

    it('totals a month nothing was reported into at zero', async () => {
      const { table } = await run({ organisations: [] })

      expect(
        table.data.months['2026-01'].totals[WASTE_PROCESSING_TYPE.EXPORTER]
      ).toEqual(
        withNoOperators({
          ...noMeasures(WASTE_PROCESSING_TYPE.EXPORTER),
          tonnageSentOnTotal: 0
        })
      )
    })
  })
})
