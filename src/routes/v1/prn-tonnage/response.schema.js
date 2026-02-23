import Joi from 'joi'
import { MATERIAL, TONNAGE_BAND } from '#domain/organisations/model.js'

const prnTonnageRowSchema = Joi.object({
  organisationName: Joi.string().required(),
  organisationId: Joi.string().required(),
  accreditationNumber: Joi.string().required(),
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  tonnageBand: Joi.string()
    .valid(...Object.values(TONNAGE_BAND))
    .allow(null)
    .optional(),
  awaitingAuthorisationTonnage: Joi.number().required(),
  awaitingAcceptanceTonnage: Joi.number().required(),
  awaitingCancellationTonnage: Joi.number().required(),
  acceptedTonnage: Joi.number().required(),
  cancelledTonnage: Joi.number().required()
})

export const prnTonnageResponseSchema = Joi.object({
  generatedAt: Joi.string().isoDate().required(),
  rows: Joi.array().items(prnTonnageRowSchema).required()
})
