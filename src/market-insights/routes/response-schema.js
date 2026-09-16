import Joi from 'joi'

const REPORTING_MONTH = /^\d{4}-\d{2}$/

/**
 * Every key the publication prints is required, so a material or
 * accreditation type nothing reported into is still served, at zero.
 *
 * @param {readonly string[]} keys
 * @param {Joi.Schema} valueSchema
 */
export const recordOf = (keys, valueSchema) =>
  Joi.object(
    Object.fromEntries(keys.map((key) => [key, valueSchema.required()]))
  )

/**
 * A map keyed by reporting month, `YYYY-MM`.
 *
 * @param {Joi.Schema} monthSchema
 */
export const byReportingMonth = (monthSchema) =>
  Joi.object().pattern(REPORTING_MONTH, monthSchema.required()).required()

export const metaSchema = Joi.object({
  generatedAt: Joi.string().isoDate().required()
}).required()
