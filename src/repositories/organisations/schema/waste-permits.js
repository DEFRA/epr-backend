import Joi from 'joi'
import {
  REGULATOR,
  MATERIAL,
  TIME_SCALE,
  WASTE_PERMIT_TYPE
} from '#domain/organisations/model.js'
import {
  requiredForPermitAndReprocessor,
  requiredForWasteExemptionAndReprocessor
} from './helpers.js'

export const wasteExemptionSchema = Joi.object({
  reference: Joi.when(Joi.ref('submittedToRegulator', { ancestor: 5 }), {
    is: Joi.valid(REGULATOR.EA, REGULATOR.NRW),
    then: Joi.string()
      .required()
      .regex(/^[wW][eE][xX]\d{6}$/),
    otherwise: Joi.string().required()
  }),
  exemptionCode: Joi.when(Joi.ref('submittedToRegulator', { ancestor: 5 }), {
    is: Joi.valid(REGULATOR.EA, REGULATOR.NRW),
    then: Joi.string()
      .required()
      .regex(/^[a-zA-Z]\d{1,2}$/),
    otherwise: Joi.string().required()
  }),
  materials: Joi.array()
    .items(
      Joi.valid(
        MATERIAL.ALUMINIUM,
        MATERIAL.FIBRE,
        MATERIAL.GLASS,
        MATERIAL.PAPER,
        MATERIAL.PLASTIC,
        MATERIAL.STEEL,
        MATERIAL.WOOD
      )
    )
    .min(1)
    .required()
})

export const authorisedMaterialSchema = Joi.object({
  material: Joi.string()
    .valid(
      MATERIAL.ALUMINIUM,
      MATERIAL.FIBRE,
      MATERIAL.GLASS,
      MATERIAL.PAPER,
      MATERIAL.PLASTIC,
      MATERIAL.STEEL,
      MATERIAL.WOOD
    )
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
