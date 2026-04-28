import { OPERATOR_CATEGORY } from '#reports/domain/operator-category.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import {
  exportManualFields,
  prnManualFields,
  recyclingManualFields
} from '#reports/repository/schema.js'
import Boom from '@hapi/boom'
import Joi from 'joi'

/**
 * @import { OperatorCategory } from '#reports/domain/operator-category.js'
 * @import { Report } from '#reports/repository/port.js'
 * @import { EnrichedBoom } from '#common/types/enriched-boom.js'
 */

const required = (/** @type {Record<string, Joi.Schema>} */ fields) =>
  Object.fromEntries(
    Object.entries(fields).map(([key, schema]) => [
      key,
      schema.empty(null).required()
    ])
  )

const recyclingBlock = Joi.object({
  recyclingActivity: Joi.object(required(recyclingManualFields))
    .unknown(true)
    .empty(null)
    .required()
})

const exportBlock = Joi.object({
  exportActivity: Joi.object(required(exportManualFields))
    .unknown(true)
    .empty(null)
    .required()
})

const prnBlock = Joi.object({
  prn: Joi.object(required(prnManualFields))
    .unknown(true)
    .empty(null)
    .required()
})

const compose = (/** @type {Joi.ObjectSchema[]} */ ...blocks) =>
  blocks.reduce((acc, block) => acc.concat(block), Joi.object().unknown(true))

/** @type {Record<OperatorCategory, Joi.ObjectSchema>} */
export const completeReportSchemas = Object.freeze({
  [OPERATOR_CATEGORY.EXPORTER]: compose(exportBlock, prnBlock),
  [OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY]: compose(exportBlock),
  [OPERATOR_CATEGORY.REPROCESSOR]: compose(recyclingBlock, prnBlock),
  [OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY]: compose(recyclingBlock)
})

/**
 * @param {Report} report
 * @param {OperatorCategory} operatorCategory
 * @returns {string[]} dotted paths of required fields missing from the report
 */
const findMissingFields = (report, operatorCategory) => {
  const schema = completeReportSchemas[operatorCategory]

  if (!schema) {
    throw new TypeError(`Unknown operator category: ${operatorCategory}`)
  }

  const { error } = schema.validate(report, { abortEarly: false })

  return error ? error.details.map((d) => d.path.join('.')) : []
}

/**
 * Throws a 400 Boom with `output.payload.missingFields` if any required
 * manual-entry fields are missing for the given operator category.
 *
 * @param {Report} report
 * @param {OperatorCategory} operatorCategory
 * @returns {void}
 */
export const assertReportComplete = (report, operatorCategory) => {
  const missingFields = findMissingFields(report, operatorCategory)
  if (!missingFields.length) {
    return
  }

  const boom = /** @type {EnrichedBoom} */ (
    Boom.badRequest(
      `Report is incomplete; ${missingFields.length} required field(s) not populated`
    )
  )
  boom.code = errorCodes.reportIncomplete
  boom.event = {
    action: 'update_report_status',
    reason: `missingCount=${missingFields.length} missingFields=[${missingFields.join(',')}]`,
    reference: report.id
  }
  boom.output.payload.missingFields = missingFields
  throw boom
}
