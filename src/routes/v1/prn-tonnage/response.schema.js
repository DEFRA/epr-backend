import Joi from 'joi'
import { MATERIAL } from '#domain/organisations/model.js'

const prnTonnageRowSchema = Joi.object({
  organisationName: Joi.string().required(),
  organisationId: Joi.string().required(),
  accreditationNumber: Joi.string().required(),
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  tonnageBand: Joi.string().allow(null).optional(),
  createdTonnage: Joi.number().required(),
  issuedTonnage: Joi.number().required(),
  cancelledTonnage: Joi.number().required()
})

export const prnTonnageResponseSchema = Joi.object({
  generatedAt: Joi.string().isoDate().required(),
  rows: Joi.array().items(prnTonnageRowSchema).required()
})
