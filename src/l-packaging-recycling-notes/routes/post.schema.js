import Joi from 'joi'

import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

const POSITIVE_INTEGER = 1
const MAX_ISSUER_NOTES_LENGTH = 200

export const packagingRecyclingNotesCreatePayloadSchema = Joi.object({
  issuedToOrganisation: Joi.string().required(),
  tonnage: Joi.number().integer().min(POSITIVE_INTEGER).required(),
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  wasteProcessingType: Joi.string()
    .valid(...Object.values(WASTE_PROCESSING_TYPE))
    .required(),
  issuerNotes: Joi.string().max(MAX_ISSUER_NOTES_LENGTH).allow('').optional()
}).messages({
  'any.required': '{#label} is required',
  'number.min': '{#label} must be at least {#limit}',
  'number.integer': '{#label} must be a whole number',
  'string.max': '{#label} must be at most {#limit} characters'
})
