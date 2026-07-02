import Joi from 'joi'

import { CADENCE } from './cadence.js'

const START_YEAR = 2024
const MAX_YEAR = 2100
const PERIOD_START = 1
const PERIOD_END = 12

/**
 * Joi schema for a reporting-period reference (`{ year, cadence, period }`).
 * Shared by the persisted closed-period list and the resubmission repository op
 * so both validate the same shape and bounds.
 */
export const periodRefSchema = Joi.object({
  year: Joi.number().integer().min(START_YEAR).max(MAX_YEAR).required(),
  cadence: Joi.string()
    .valid(...Object.values(CADENCE))
    .required(),
  period: Joi.number().integer().min(PERIOD_START).max(PERIOD_END).required()
})
