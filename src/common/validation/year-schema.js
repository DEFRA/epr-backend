import Joi from 'joi'

import { toYear } from '#common/helpers/dates/year.js'

/** @import { NumberSchema } from 'joi' */

/**
 * The earliest calendar year the service holds year-scoped data for.
 */
export const MIN_YEAR = 2024

/**
 * The latest calendar year a route may be asked about. Far enough out that
 * it never needs revisiting for its own sake.
 */
export const MAX_YEAR = 2100

/**
 * A calendar year as a route param or payload field, branded as a `Year`.
 * Callers add `.required()` as the field needs.
 * @returns {NumberSchema}
 */
export const yearSchema = () =>
  Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR).custom(toYear)
