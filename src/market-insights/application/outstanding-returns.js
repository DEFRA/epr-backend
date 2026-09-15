import {
  TONNAGE_BAND,
  TONNAGE_MONITORING_MATERIALS
} from '#domain/organisations/model.js'
import { resolveMaterial } from '#domain/organisations/registration-utils.js'
import { recordOf } from '#market-insights/domain/record-of.js'
import { owedMonthlyReports } from '#market-insights/application/monthly-reports.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { Material, TonnageBand } from '#domain/organisations/model.js' */

/**
 * @typedef {Record<TonnageBand, number>} OutstandingByBand
 * @typedef {Record<Material, OutstandingByBand>} OutstandingByMaterial
 */

/** @type {readonly TonnageBand[]} */
const TONNAGE_BANDS = Object.values(TONNAGE_BAND)

/**
 * @param {YearMonth} month
 * @param {Material} material
 * @param {TonnageBand} tonnageBand
 */
const cellKey = (month, material, tonnageBand) =>
  `${month}::${material}::${tonnageBand}`

/**
 * Count, for each month served, the accredited operators that owed a monthly
 * report and have not submitted one, by material and tonnage band. Every
 * material and band is served for every month, at zero where nothing is
 * outstanding, so the publication's grid never loses a row.
 *
 * @param {Parameters<typeof owedMonthlyReports>[0]} params
 * @returns {Record<YearMonth, OutstandingByMaterial>}
 */
export const countOutstandingReturns = (params) => {
  /** @type {Map<string, number>} */
  const outstanding = new Map()
  for (const {
    month,
    registration,
    accreditation,
    submitted
  } of owedMonthlyReports(params)) {
    if (submitted) {
      continue
    }
    const key = cellKey(
      month,
      resolveMaterial(registration),
      accreditation.prnIssuance.tonnageBand
    )
    outstanding.set(key, (outstanding.get(key) ?? 0) + 1)
  }
  return recordOf(params.months, (month) =>
    recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
      recordOf(
        TONNAGE_BANDS,
        (tonnageBand) =>
          outstanding.get(cellKey(month, material, tonnageBand)) ?? 0
      )
    )
  )
}

/**
 * @typedef {Object} OutstandingReturnsTable
 * @property {{ generatedAt: string }} meta
 * @property {{ months: Record<YearMonth, OutstandingByMaterial> }} data
 */

/**
 * The outstanding returns for the given reporting months, read from the
 * register and the monthly reports as they stand.
 *
 * @param {Object} params
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} params.organisationsRepository
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {YearMonth[]} params.months - the reporting months to publish
 * @param {Date} params.now - clock reading supplied by the caller
 * @returns {Promise<OutstandingReturnsTable>}
 */
export const buildOutstandingReturnsTable = async ({
  organisationsRepository,
  reportsRepository,
  months,
  now
}) => {
  const [organisations, periodicReports] = await Promise.all([
    organisationsRepository.findAll(),
    reportsRepository.findAllPeriodicReports()
  ])
  return {
    meta: { generatedAt: now.toISOString() },
    data: {
      months: countOutstandingReturns({
        organisations,
        periodicReports,
        months
      })
    }
  }
}
