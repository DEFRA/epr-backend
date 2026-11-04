import Joi from 'joi'

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
 * A calendar year as a route param or payload field. Callers add
 * `.required()` as the field needs. Joi cannot brand a value for tsc, so a
 * handler types a param validated with this as `Year`.
 * @returns {NumberSchema}
 */
export const yearSchema = () =>
  Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR)
