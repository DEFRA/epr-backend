import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { VALUE_TYPE } from '#domain/organisations/model.js'

const valueTypeSchema = Joi.string()
  .valid(VALUE_TYPE.ACTUAL, VALUE_TYPE.ESTIMATED)
  .required()

const inputSchema = Joi.object({
  type: valueTypeSchema,
  ukPackagingWasteInTonnes: Joi.number().required(),
  nonUkPackagingWasteInTonnes: Joi.number().required(),
  nonPackagingWasteInTonnes: Joi.number().required()
})

const rawMaterialInputsSchema = Joi.object({
  material: Joi.string().required(),
  weightInTonnes: Joi.number().required()
})

const outputSchema = Joi.object({
  type: valueTypeSchema,
  sentToAnotherSiteInTonnes: Joi.number().required(),
  contaminantsInTonnes: Joi.number().required(),
  processLossInTonnes: Joi.number().required()
})

const productsMadeFromRecyclingSchema = Joi.object({
  name: Joi.string().required(),
  weightInTonnes: Joi.number().required()
})

export const yearlyMetricsSchema = Joi.object({
  year: yearSchema().required(),
  input: inputSchema.required(),
  rawMaterialInputs: Joi.array()
    .items(rawMaterialInputsSchema)
    .required()
    .min(1),
  output: outputSchema.required(),
  productsMadeFromRecycling: Joi.array()
    .items(productsMadeFromRecyclingSchema)
    .required()
    .min(1)
})
