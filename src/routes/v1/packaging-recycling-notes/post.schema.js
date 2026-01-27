import Joi from 'joi'

import {
  MATERIAL,
  NATION,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

const POSITIVE_INTEGER = 1

export const packagingRecyclingNotesCreatePayloadSchema = Joi.object({
  issuedToOrganisation: Joi.string().required(),
  tonnage: Joi.number().integer().min(POSITIVE_INTEGER).required(),
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  nation: Joi.string()
    .valid(...Object.values(NATION))
    .required(),
  wasteProcessingType: Joi.string()
    .valid(...Object.values(WASTE_PROCESSING_TYPE))
    .required(),
  issuerNotes: Joi.string().max(200).allow('').optional()
}).messages({
  'any.required': '{#label} is required',
  'number.min': '{#label} must be at least {#limit}',
  'number.integer': '{#label} must be a whole number',
  'string.max': '{#label} must be at most {#limit} characters'
})
