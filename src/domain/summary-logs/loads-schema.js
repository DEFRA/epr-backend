import Joi from 'joi'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * Shared Joi schemas for loads classification
 *
 * Used by both repository (storage validation) and route (response validation)
 */

export const loadCategorySchema = Joi.object({
  count: Joi.number().integer().min(0).required(),
  rowIds: Joi.array()
    .items(Joi.alternatives().try(Joi.string(), Joi.number()))
    .max(100)
    .required()
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

const periodStatusByChangeSchema = Joi.object({
  tonnageDelta: Joi.number().required()
})

const periodStatusSchema = Joi.object({
  added: periodStatusByChangeSchema.allow(null).required(),
  adjusted: periodStatusByChangeSchema.allow(null).required()
})

export const loadsByPeriodStatusSchema = Joi.object({
  open: periodStatusSchema.allow(null).required(),
  closed: periodStatusSchema.allow(null).required()
})

export const loadsByWasteRecordTypeSchema = Joi.array()
  .items(
    Joi.object({
      wasteRecordType: Joi.string()
        .valid(...Object.values(WASTE_RECORD_TYPE))
        .required(),
      sheetName: Joi.string().required(),
      added: loadValiditySchema.required(),
      unchanged: loadValiditySchema.required(),
      adjusted: loadValiditySchema.required()
    })
  )
  .unique('wasteRecordType')
