import Joi from 'joi'

const POSITIVE_INTEGER = 1
const MAX_NOTES_LENGTH = 200

export const packagingRecyclingNotesCreatePayloadSchema = Joi.object({
  issuedToOrganisation: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    tradingName: Joi.string().empty(Joi.valid(null, '')).optional(),
    registrationType: Joi.string().optional()
  }).required(),
  tonnage: Joi.number().integer().min(POSITIVE_INTEGER).required(),
  notes: Joi.string().max(MAX_NOTES_LENGTH).allow('').optional()
}).messages({
  'any.required': '{#label} is required',
  'number.min': '{#label} must be at least {#limit}',
  'number.integer': '{#label} must be a whole number',
  'string.max': '{#label} must be at most {#limit} characters'
})
