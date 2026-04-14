import { OPERATOR_CATEGORY } from './operator-category.js'

/**
 * @import { OperatorCategory } from './operator-category.js'
 * @import { Report } from '#reports/repository/port.js'
 * @typedef {(report: Report) => unknown} FieldAccessor
 */

/** @type {FieldAccessor} */
const tonnageRecycled = (r) => r.recyclingActivity?.tonnageRecycled
/** @type {FieldAccessor} */
const tonnageNotRecycled = (r) => r.recyclingActivity?.tonnageNotRecycled
/** @type {FieldAccessor} */
const tonnageReceivedNotExported = (r) =>
  r.exportActivity?.tonnageReceivedNotExported
/** @type {FieldAccessor} */
const prnTotalRevenue = (r) => r.prn?.totalRevenue
/** @type {FieldAccessor} */
const prnFreeTonnage = (r) => r.prn?.freeTonnage

/** @type {Record<OperatorCategory, FieldAccessor[]>} */
const REQUIRED_FIELDS_BY_OPERATOR_CATEGORY = Object.freeze({
  [OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY]: [
    tonnageRecycled,
    tonnageNotRecycled
  ],
  [OPERATOR_CATEGORY.REPROCESSOR]: [
    tonnageRecycled,
    tonnageNotRecycled,
    prnTotalRevenue,
    prnFreeTonnage
  ],
  [OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY]: [tonnageReceivedNotExported],
  [OPERATOR_CATEGORY.EXPORTER]: [
    tonnageReceivedNotExported,
    prnTotalRevenue,
    prnFreeTonnage
  ]
})

/**
 * @param {Report} report
 * @param {OperatorCategory} operatorCategory
 * @returns {boolean}
 */
export const isReportComplete = (report, operatorCategory) => {
  const required = REQUIRED_FIELDS_BY_OPERATOR_CATEGORY[operatorCategory]

  if (!required) {
    throw new TypeError(`Unknown operator category: ${operatorCategory}`)
  }

  return required.every((get) => {
    const value = get(report)
    return value !== null && value !== undefined
  })
}
