import Joi from 'joi'
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

const START_YEAR = 2024
const MAX_YEAR = 2100
const yearSchema = Joi.number()
  .integer()
  .min(START_YEAR)
  .max(MAX_YEAR)
  .required()

export const yearlyMetricsSchema = Joi.object({
  year: yearSchema,
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
