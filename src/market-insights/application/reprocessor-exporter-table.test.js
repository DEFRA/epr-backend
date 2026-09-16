import { describe, it, expect, vi } from 'vitest'
import {
  ACCREDITATION_STATUS,
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REGISTRATION_STATUS,
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
 *   registrationStatusHistory?: { status: import('#domain/organisations/model.js').RegistrationStatus, updatedAt: string }[]
 *   accreditationStatusHistory?: { status: import('#domain/organisations/model.js').AccreditationStatus, updatedAt: string }[]
 * }} options
 */
const makeOperator = ({
  orgId,
  material = MATERIAL.PLASTIC,
  glassRecyclingProcess,
  wasteProcessingType = WASTE_PROCESSING_TYPE.REPROCESSOR,
  registrationStatusHistory = approvedHistory,
  accreditationStatusHistory = approvedHistory
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
        reprocessingType: REPROCESSING_TYPE.INPUT
      }
    ],
    accreditations: [
      {
        id: accreditationId,
        accreditationNumber: `ACC-${orgId}`,
        status: accreditationStatusHistory.at(-1)?.status,
        statusHistory: accreditationStatusHistory,
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        material,
        wasteProcessingType
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
 *   months?: import('#common/helpers/dates/year-month.js').YearMonth[]
 * }} options
 */
const run = async ({
  organisations,
  reports = [],
  inFlightResubmissions = [],
  months = JANUARY_TO_MARCH_2026
}) => {
  const reportsRepository = createInMemoryReportsRepository()()
  for (const report of reports) {
    await buildSubmittedReport(reportsRepository, report)
  }
  for (const report of inFlightResubmissions) {
    await seedInFlightResubmission(reportsRepository, report)
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
    now: NOW
  })
  return { table, logger }
}

const NO_REPROCESSOR_ACTIVITY = {
  ...noMeasures(WASTE_PROCESSING_TYPE.REPROCESSOR),
  tonnageSentOnTotal: 0,
  averagePricePerTonne: 0
}

const NO_EXPORTER_ACTIVITY = {
  ...noMeasures(WASTE_PROCESSING_TYPE.EXPORTER),
  tonnageSentOnTotal: 0,
  averagePricePerTonne: 0
}

/**
 * The cells something was reported into, flattened to one row each. The table
 * carries a zero cell for every other combination, which these tests are not
 * about.
 *
 * @param {import('./reprocessor-exporter-table.js').ReprocessorExporterTable} table
 */
const reported = (table) =>
  Object.entries(table.data.months).flatMap(([month, { figures }]) =>
    Object.entries(figures).flatMap(([material, byAccreditationType]) =>
      Object.entries(byAccreditationType)
        .filter(([, cell]) =>
          Object.values(cell).some((measure) => measure !== 0)
        )
        .map(([accreditationType, cell]) => ({
          material,
          accreditationType,
          month,
          ...cell
        }))
    )
  )

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

  it('leaves out a test organisation without remarking on it', async () => {
    const operator = makeOperator({ orgId: TEST_ORG_ID })
    const { table, logger } = await run({
      organisations: [operator],
      reports: [monthlyReport(operator, 1, { prn: prn(10, 0, 1000) })]
    })

    expect(reported(table)).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
