import Joi from 'joi'

/**
 * Shared Joi schemas for loads classification
 *
 * Used by both repository (storage validation) and route (response validation)
 */

/**
 * @typedef {Object} LoadCategory
 * @property {number} count - Total count of loads
 * @property {string[]} rowIds - Row IDs (truncated to the schema's cap)
 */

/**
 * @typedef {Object} LoadValidity
 * @property {LoadCategory} valid - Valid loads (no issues)
 * @property {LoadCategory} invalid - Invalid loads (has issues)
 * @property {LoadCategory} included - Loads included in Waste Balance calculation
 * @property {LoadCategory} excluded - Loads excluded from Waste Balance calculation
 */

/**
 * @typedef {Object} Loads
 * @property {LoadValidity} added - Loads added in this upload
 * @property {LoadValidity} unchanged - Loads unchanged from previous uploads
 * @property {LoadValidity} adjusted - Loads adjusted in this upload
 */

export const loadCategorySchema = Joi.object({
  count: Joi.number().integer().min(0).required(),
  rowIds: Joi.array().items(Joi.string()).max(100).required()
})

export const loadValiditySchema = Joi.object({
  valid: loadCategorySchema.required(),
  invalid: loadCategorySchema.required(),
  included: loadCategorySchema.required(),
  excluded: loadCategorySchema.required()
})

export const loadsSchema = Joi.object({
  added: loadValiditySchema.required(),
  unchanged: loadValiditySchema.required(),
  adjusted: loadValiditySchema.required()
})
