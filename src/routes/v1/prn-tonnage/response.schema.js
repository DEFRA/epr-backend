import Joi from 'joi'
import { tonnageBandSchema } from '#common/validation/tonnage-band-schema.js'
import { MATERIAL } from '#domain/organisations/model.js'
import { REGISTRATION_TYPE } from '#application/prn-tonnage/aggregate-prn-tonnage.js'

const prnTonnageRowSchema = Joi.object({
  organisationName: Joi.string().required(),
  orgId: Joi.string().required(),
  registrationNumber: Joi.string().required(),
  registrationType: Joi.string()
    .valid(...Object.values(REGISTRATION_TYPE))
    .required(),
  accreditationNumber: Joi.string().allow('').required(),
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  tonnageBand: tonnageBandSchema.required(),
  wasteBalance: Joi.number().required(),
  availableWasteBalance: Joi.number().required(),
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
