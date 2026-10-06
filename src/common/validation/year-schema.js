import Joi from 'joi'

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
 * `.required()` as the field needs.
 * @returns {import('joi').NumberSchema}
 */
export const yearSchema = () =>
  Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR)
