import Joi from 'joi'

/**
 * A whole-number tonnage. PERNs/PRNs are issued in whole tonnes, so a tonnage
 * value - and any sum of them, such as a report's issued tonnage - is a
 * non-negative integer. Callers add `.min()` to raise the floor, `.required()`
 * or `.allow(null)` as the field needs.
 * @returns {import('joi').NumberSchema}
 */
export const wholeTonnage = () => Joi.number().integer().min(0)
