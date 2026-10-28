import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { CADENCE } from './cadence.js'

const PERIOD_START = 1
const PERIOD_END = 12

/**
 * Joi schema for a reporting-period reference (`{ year, cadence, period }`).
 * Shared by the persisted closed-period list and the resubmission repository op
 * so both validate the same shape and bounds.
 */
export const periodRefSchema = Joi.object({
  year: yearSchema().required(),
  cadence: Joi.string()
    .valid(...Object.values(CADENCE))
    .required(),
  period: Joi.number().integer().min(PERIOD_START).max(PERIOD_END).required()
})
