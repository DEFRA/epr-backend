import Joi from 'joi'
import { MATERIAL } from '#domain/materials.js'
import {
  REGULATOR,
  TIME_SCALE,
  WASTE_PERMIT_TYPE
} from '#domain/organisations/model.js'
import {
  requiredForPermitAndReprocessor,
  requiredForWasteExemptionAndReprocessor
} from './helpers.js'

export const wasteExemptionSchema = Joi.object({
  reference: Joi.when(Joi.ref('submittedToRegulator', { ancestor: 5 }), {
    is: Joi.valid(REGULATOR.EA),
    then: Joi.string()
      .required()
      .regex(/^[wW][eE][xX]\d{6}$/)
      .messages({
        'string.pattern.base':
          'WEX reference must be in format WEX followed by 6 digits (e.g. WEX123456)'
      }),
    otherwise: Joi.string().required()
  }),
  exemptionCode: Joi.when(Joi.ref('submittedToRegulator', { ancestor: 5 }), {
    is: Joi.valid(REGULATOR.EA),
    then: Joi.string()
      .required()
      .regex(/^[a-zA-Z]\d{1,2}$/)
      .messages({
        'string.pattern.base':
          'Exemption code must be a letter followed by 1-2 digits (e.g. U9)'
      }),
    otherwise: Joi.string().required()
  }),
  materials: Joi.array()
    .items(Joi.valid(...Object.values(MATERIAL)))
    .min(1)
    .required()
})

export const authorisedMaterialSchema = Joi.object({
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  authorisedWeightInTonnes: Joi.number().required(),
  timeScale: Joi.string()
    .valid(TIME_SCALE.WEEKLY, TIME_SCALE.MONTHLY, TIME_SCALE.YEARLY)
    .required()
})

export const wasteManagementPermitSchema = Joi.object({
  type: Joi.string()
    .valid(
      WASTE_PERMIT_TYPE.ENVIRONMENTAL_PERMIT,
      WASTE_PERMIT_TYPE.INSTALLATION_PERMIT,
      WASTE_PERMIT_TYPE.WASTE_EXEMPTION
    )
    .required(),
  permitNumber: requiredForPermitAndReprocessor(Joi.string()),
  exemptions: requiredForWasteExemptionAndReprocessor(
    Joi.array().items(wasteExemptionSchema).min(1)
  ),
  authorisedMaterials: requiredForPermitAndReprocessor(
    Joi.array().items(authorisedMaterialSchema).min(1)
  )
})
