import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { selectSubmittedReports } from '#reports/domain/merge-reporting-periods.js'
import { periodBounds } from '#reports/domain/reporting-period.js'
import {
  getReportableRegistrations,
  resolveMaterial
} from '#domain/organisations/registration-utils.js'
import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  addMeasures,
  measuresOf,
  noMeasures,
  withPublishedFigures
} from '#market-insights/domain/reprocessor-exporter-figures.js'
import { recordOf } from '#market-insights/domain/record-of.js'

/**
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#reports/repository/port.js').ReportsRepository} ReportsRepository
 * @typedef {import('#common/helpers/dates/year-month.js').YearMonth} YearMonth
 * @typedef {import('#domain/organisations/model.js').Material} Material
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#domain/organisations/registration.js').ReportableRegistration} ReportableRegistration
 * @typedef {import('#market-insights/domain/reprocessor-exporter-figures.js').Measures} Measures
 * @typedef {import('#market-insights/domain/reprocessor-exporter-figures.js').PublishedFigures} PublishedFigures
 */

/**
 * @typedef {Record<WasteProcessingTypeValue, PublishedFigures>} FiguresByAccreditationType
 * @typedef {Record<Material, FiguresByAccreditationType>} FiguresByMaterial
 */

/**
 * @typedef {Object} ReprocessorExporterTable
 * @property {{ generatedAt: string }} meta
 * @property {{ months: Record<YearMonth, { figures: FiguresByMaterial }> }} data
 */

/**
 * @param {{ material: Material, accreditationType: WasteProcessingTypeValue, month: YearMonth }} cell
 */
const cellKey = ({ material, accreditationType, month }) =>
  `${material}::${accreditationType}::${month}`

/**
 * @param {{ organisationId: string, registrationId: string }} ref
 */
const registrationKey = ({ organisationId, registrationId }) =>
  `${organisationId}::${registrationId}`

/**
 * The submission that counts for a period: the highest submission number, as
 * the report-submissions feed tells its consumers to take. Ranked by number
 * rather than date because two submissions can share a date and cannot share
 * a number. A period nothing has been submitted for counts for nothing.
 *
 * @param {import('#reports/repository/port.js').ReportPerPeriod} slot
 */
const latestSubmission = (slot) => selectSubmittedReports(slot).at(-1)

/**
 * @param {Map<string, Measures>} cells
 * @param {ReportableRegistration} registration
 * @param {YearMonth} month
 * @param {import('#reports/repository/port.js').ReportSummary} report
 */
const foldIntoCell = (cells, registration, month, report) => {
  const accreditationType = /** @type {WasteProcessingTypeValue} */ (
    registration.wasteProcessingType
  )
  const key = cellKey({
    material: resolveMaterial(registration),
    accreditationType,
    month
  })
  cells.set(
    key,
    addMeasures(
      cells.get(key) ?? noMeasures(accreditationType),
      measuresOf(report, accreditationType)
    )
  )
}

/**
 * The publication prints every material and both accreditation types for
 * every month, so a combination nothing was reported into is still served, at
 * zero: a row vanishing when a material has no data is the error the work
 * instruction warns about.
 *
 * @param {Map<string, Measures>} cells
 * @param {YearMonth} month
 * @returns {FiguresByMaterial}
 */
const publishedFigures = (cells, month) =>
  recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
    recordOf(Object.values(WASTE_PROCESSING_TYPE), (accreditationType) =>
      withPublishedFigures(
        cells.get(cellKey({ material, accreditationType, month })) ??
          noMeasures(accreditationType)
      )
    )
  )

/**
 * Aggregate the published UK reprocessor and exporter figures for the given
 * reporting months: the latest monthly submission of every accredited
 * registration, summed by material and accreditation type within each month.
 * Quarterly reports belong to registered-only operators and are left out.
 *
 * @param {Object} params
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {ReportsRepository} params.reportsRepository
 * @param {YearMonth[]} params.months - the reporting months to publish
 * @param {Date} params.now - clock reading supplied by the caller
 * @returns {Promise<ReprocessorExporterTable>}
 */
export const buildReprocessorExporterTable = async ({
  organisationsRepository,
  reportsRepository,
  months,
  now
}) => {
  const [organisations, periodicReports] = await Promise.all([
    organisationsRepository.findAll(),
    reportsRepository.findAllPeriodicReports()
  ])

  const registrations = new Map(
    getReportableRegistrations(organisations).map(({ org, registration }) => [
      registrationKey({
        organisationId: org.id,
        registrationId: registration.id
      }),
      registration
    ])
  )
  const served = new Set(months)
  /** @type {Map<string, Measures>} */
  const cells = new Map()

  for (const periodicReport of periodicReports) {
    const registration = registrations.get(registrationKey(periodicReport))
    if (registration === undefined) {
      continue
    }
    for (const [period, slot] of Object.entries(
      periodicReport.reports.monthly ?? {}
    )) {
      const month = toYearMonth(
        periodBounds(CADENCE.monthly, periodicReport.year, Number(period))
          .startDate
      )
      const report = latestSubmission(slot)
      if (served.has(month) && report !== undefined) {
        foldIntoCell(cells, registration, month, report)
      }
    }
  }

  return {
    meta: { generatedAt: now.toISOString() },
    data: {
      months: recordOf(months, (month) => ({
        figures: publishedFigures(cells, month)
      }))
    }
  }
}
