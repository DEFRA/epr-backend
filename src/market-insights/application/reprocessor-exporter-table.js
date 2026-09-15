import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { selectSubmittedReports } from '#reports/domain/merge-reporting-periods.js'
import { periodBounds } from '#reports/domain/reporting-period.js'
import {
  getReportableRegistrations,
  resolveAccreditation,
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
 * One reporting month as published: the figures for every material and
 * accreditation type.
 *
 * @typedef {Object} PublishedMonth
 * @property {FiguresByMaterial} figures
 */

/**
 * @typedef {Object} ReprocessorExporterTable
 * @property {{ generatedAt: string }} meta
 * @property {{ months: Record<YearMonth, PublishedMonth> }} data
 */

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

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
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {string} registrationKey
 */
const warnAboutUnmatchedReport = (logger, registrationKey) => {
  logger.warn({
    message: `Market insights reprocessor and exporter figures left out a periodic report whose registration no longer resolves: ${registrationKey}. Everything it reported is absent from the publication.`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: 'market_insights_report_unmatched',
      reference: registrationKey
    }
  })
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
 * reporting months: the latest monthly submission of every registration
 * holding a live accreditation, summed by material and accreditation type
 * within each month. An accreditation cancelled since loses the months it
 * filed, as the regulator's workbooks and the report-submissions extract drop
 * them. Quarterly reports belong to registered-only operators and are left
 * out.
 *
 * @param {Object} params
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {ReportsRepository} params.reportsRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {YearMonth[]} params.months - the reporting months to publish
 * @param {Date} params.now - clock reading supplied by the caller
 * @returns {Promise<ReprocessorExporterTable>}
 */
export const buildReprocessorExporterTable = async ({
  organisationsRepository,
  reportsRepository,
  logger,
  months,
  now
}) => {
  const [organisations, periodicReports] = await Promise.all([
    organisationsRepository.findAll(),
    reportsRepository.findAllPeriodicReports()
  ])

  const registrations = new Map(
    getReportableRegistrations(organisations).map((entry) => [
      registrationKey({
        organisationId: entry.org.id,
        registrationId: entry.registration.id
      }),
      entry
    ])
  )
  const testOrganisationIds = new Set(
    organisations
      .filter((org) => TEST_ORGANISATIONS.has(org.orgId))
      .map((org) => org.id)
  )
  const served = new Set(months)
  /** @type {Map<string, Measures>} */
  const cells = new Map()

  for (const periodicReport of periodicReports) {
    const key = registrationKey(periodicReport)
    const entry = registrations.get(key)
    if (entry === undefined) {
      if (!testOrganisationIds.has(periodicReport.organisationId)) {
        warnAboutUnmatchedReport(logger, key)
      }
      continue
    }
    const { org, registration } = entry
    if (resolveAccreditation(registration, org) === null) {
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
