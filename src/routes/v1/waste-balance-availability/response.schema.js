import Joi from 'joi'
import { EFFECTIVE_MATERIALS } from '#domain/materials.js'

const materialBalanceSchema = Joi.object({
  material: Joi.string()
    .valid(...EFFECTIVE_MATERIALS)
    .required(),
  availableAmount: Joi.number().required()
})

const materialsExample = EFFECTIVE_MATERIALS.map((material) => ({
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
