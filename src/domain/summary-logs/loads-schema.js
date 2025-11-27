import Joi from 'joi'

/**
 * Shared Joi schemas for loads classification
 *
 * Used by both repository (storage validation) and route (response validation)
 */

export const loadRowIdsSchema = Joi.object({
  valid: Joi.array()
    .items(Joi.alternatives().try(Joi.string(), Joi.number()))
    .max(100)
    .required(),
  invalid: Joi.array()
    .items(Joi.alternatives().try(Joi.string(), Joi.number()))
    .max(100)
    .required()
})

export const loadTotalsSchema = Joi.object({
  valid: Joi.number().integer().min(0).required(),
  invalid: Joi.number().integer().min(0).required()
})

export const loadsSchema = Joi.object({
  added: loadRowIdsSchema.required(),
  unchanged: loadRowIdsSchema.required(),
  adjusted: loadRowIdsSchema.required(),
  totals: Joi.object({
    added: loadTotalsSchema.required(),
    unchanged: loadTotalsSchema.required(),
    adjusted: loadTotalsSchema.required()
  }).required()
})
