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

const recyclingBlock = Joi.object({
  recyclingActivity: Joi.object({
    tonnageRecycled: recyclingActivitySchema
      .extract('tonnageRecycled')
      .empty(null)
      .required(),
    tonnageNotRecycled: recyclingActivitySchema
      .extract('tonnageNotRecycled')
      .empty(null)
      .required()
  })
    .unknown(true)
    .empty(null)
    .required()
})

const exportBlock = Joi.object({
  exportActivity: Joi.object({
    tonnageReceivedNotExported: exportActivitySchema
      .extract('tonnageReceivedNotExported')
      .empty(null)
      .required()
  })
    .unknown(true)
    .empty(null)
    .required()
})

const prnBlock = Joi.object({
  prn: Joi.object({
    totalRevenue: prnSchema.extract('totalRevenue').empty(null).required(),
    freeTonnage: prnSchema.extract('freeTonnage').empty(null).required()
  })
    .unknown(true)
    .empty(null)
    .required()
})

const baseReportSchema = Joi.object().unknown(true)

/** @type {Record<OperatorCategory, Joi.ObjectSchema>} */
export const completeReportSchemas = Object.freeze({
  [OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY]:
    baseReportSchema.concat(recyclingBlock),
  [OPERATOR_CATEGORY.REPROCESSOR]: baseReportSchema
    .concat(recyclingBlock)
    .concat(prnBlock),
  [OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY]:
    baseReportSchema.concat(exportBlock),
  [OPERATOR_CATEGORY.EXPORTER]: baseReportSchema
    .concat(exportBlock)
    .concat(prnBlock)
})

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
