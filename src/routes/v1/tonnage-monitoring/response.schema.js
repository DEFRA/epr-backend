import Joi from 'joi'
import { MATERIAL } from '#domain/organisations/model.js'

const materialTonnageSchema = Joi.object({
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  totalTonnage: Joi.number().required()
})

export const tonnageMonitoringResponseSchema = Joi.object({
  generatedAt: Joi.string().isoDate().required(),
  materials: Joi.array().items(materialTonnageSchema).required(),
  total: Joi.number().required()
})
