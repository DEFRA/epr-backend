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
