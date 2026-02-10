import Joi from 'joi'

import { MATERIAL } from '#domain/organisations/model.js'

const POSITIVE_INTEGER = 1
const MAX_NOTES_LENGTH = 200

export const packagingRecyclingNotesCreatePayloadSchema = Joi.object({
  issuedToOrganisation: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    tradingName: Joi.string().empty(Joi.valid(null, '')).optional()
  }).required(),
  tonnage: Joi.number().integer().min(POSITIVE_INTEGER).required(),
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  notes: Joi.string().max(MAX_NOTES_LENGTH).allow('').optional()
}).messages({
  'any.required': '{#label} is required',
  'number.min': '{#label} must be at least {#limit}',
  'number.integer': '{#label} must be a whole number',
  'string.max': '{#label} must be at most {#limit} characters'
})
