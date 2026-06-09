import Joi from 'joi'

/**
 * Shared Joi schema for loads classified by reporting period status.
 *
 * Used by both repository (storage validation) and route (response validation).
 */

const periodStatusBucketSchema = Joi.object({
  count: Joi.number().integer().min(0).required(),
  tonnageDelta: Joi.number().required()
})

const periodStatusGroupSchema = Joi.object({
  included: periodStatusBucketSchema.required(),
  excluded: periodStatusBucketSchema.required()
})

const periodStatusByChangeSchema = Joi.object({
  added: periodStatusGroupSchema.required(),
  adjusted: periodStatusGroupSchema.required()
})

export const loadsByPeriodStatusSchema = Joi.object({
  open: periodStatusByChangeSchema.required(),
  closed: periodStatusByChangeSchema.required()
})
