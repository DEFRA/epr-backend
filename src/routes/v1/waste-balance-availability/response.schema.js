import Joi from 'joi'
import { TONNAGE_MONITORING_MATERIALS } from '#domain/organisations/model.js'

const materialBalanceSchema = Joi.object({
  material: Joi.string()
    .valid(...TONNAGE_MONITORING_MATERIALS)
    .required(),
  availableAmount: Joi.number().required()
})

const materialsExample = TONNAGE_MONITORING_MATERIALS.map((material) => ({
  material,
  availableAmount: 0
}))

export const wasteBalanceAvailabilityResponseSchema = Joi.object({
  generatedAt: Joi.string().isoDate().required(),
  materials: Joi.array()
    .items(materialBalanceSchema)
    .required()
    .example(materialsExample),
  total: Joi.number().required()
})
