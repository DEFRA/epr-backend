import Joi from 'joi'

/**
 * A tonnage value: a non-negative number. Callers add `.required()`,
 * `.allow(null)` or `.custom(...)` as the field needs.
 * @returns {import('joi').NumberSchema}
 */
export const tonnage = () => Joi.number().min(0)

/**
 * A whole-number tonnage: a tonnage that is also an integer. PERNs/PRNs are
 * issued in whole tonnes, so a tonnage value - and any sum of them, such as a
 * report's issued tonnage - is a non-negative integer.
 * @returns {import('joi').NumberSchema}
 */
export const wholeTonnage = () => tonnage().integer()
