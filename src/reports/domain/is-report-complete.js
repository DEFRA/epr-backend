import {
  exportActivitySchema,
  prnSchema,
  recyclingActivitySchema
} from '#reports/repository/schema.js'
import Joi from 'joi'
import { OPERATOR_CATEGORY } from './operator-category.js'

/**
 * @import { OperatorCategory } from './operator-category.js'
 * @import { Report } from '#reports/repository/port.js'
 */

export const reportShapeSchema = Joi.object({
  recyclingActivity: Joi.object({
    tonnageRecycled: recyclingActivitySchema.extract('tonnageRecycled'),
    tonnageNotRecycled: recyclingActivitySchema.extract('tonnageNotRecycled')
  })
    .unknown(true)
    .allow(null),
  exportActivity: Joi.object({
    tonnageReceivedNotExported: exportActivitySchema.extract(
      'tonnageReceivedNotExported'
    )
  })
    .unknown(true)
    .allow(null),
  prn: Joi.object({
    totalRevenue: prnSchema.extract('totalRevenue'),
    freeTonnage: prnSchema.extract('freeTonnage')
  })
    .unknown(true)
    .allow(null)
}).unknown(true)

const makeRequired = (s) => s.empty(null).required()

/** @type {Record<OperatorCategory, string[]>} */
export const completenessRequirements = Object.freeze({
  [OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY]: [
    'recyclingActivity.tonnageRecycled',
    'recyclingActivity.tonnageNotRecycled'
  ],
  [OPERATOR_CATEGORY.REPROCESSOR]: [
    'recyclingActivity.tonnageRecycled',
    'recyclingActivity.tonnageNotRecycled',
    'prn.totalRevenue',
    'prn.freeTonnage'
  ],
  [OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY]: [
    'exportActivity.tonnageReceivedNotExported'
  ],
  [OPERATOR_CATEGORY.EXPORTER]: [
    'exportActivity.tonnageReceivedNotExported',
    'prn.totalRevenue',
    'prn.freeTonnage'
  ]
})

// If any leaf under a section is required, the section itself must be
// non-null -- otherwise Joi's .allow(null) on the parent short-circuits
// validation of the children.
const withParentSections = (/** @type {string[]} */ fields) => [
  ...new Set(fields.map((f) => f.split('.')[0])),
  ...fields
]

export const completeReportSchemas =
  /** @type {Record<OperatorCategory, Joi.ObjectSchema>} */ (
    Object.freeze(
      Object.fromEntries(
        Object.entries(completenessRequirements).map(([category, fields]) => [
          category,
          reportShapeSchema.fork(withParentSections(fields), makeRequired)
        ])
      )
    )
  )

/**
 * @param {Report} report
 * @param {OperatorCategory} operatorCategory
 * @returns {boolean}
 */
export const isReportComplete = (report, operatorCategory) => {
  const schema = completeReportSchemas[operatorCategory]

  if (!schema) {
    throw new TypeError(`Unknown operator category: ${operatorCategory}`)
  }

  return !schema.validate(report).error
}
