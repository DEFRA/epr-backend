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
