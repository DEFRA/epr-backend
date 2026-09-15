import Joi from 'joi'
import { recordOf } from '#market-insights/domain/record-of.js'

/**
 * Every key the publication prints is required, so a material, accreditation
 * type or tonnage band nothing was reported into is still served, at zero.
 *
 * @param {readonly string[]} keys
 * @param {Joi.Schema} valueSchema
 */
export const requiredRecordOf = (keys, valueSchema) =>
  Joi.object(recordOf(keys, () => valueSchema.required()))

const REPORTING_MONTH = /^\d{4}-\d{2}$/

/**
 * The months a publication serves, keyed `YYYY-MM`, each holding the given
 * value.
 *
 * @param {Joi.Schema} valueSchema
 */
export const monthsOf = (valueSchema) =>
  Joi.object().pattern(REPORTING_MONTH, valueSchema.required()).required()
