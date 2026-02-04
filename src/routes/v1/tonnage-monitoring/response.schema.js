import Joi from 'joi'
import { TONNAGE_MONITORING_MATERIALS } from '#domain/organisations/model.js'

const materialTonnageSchema = Joi.object({
  material: Joi.string()
    .valid(...TONNAGE_MONITORING_MATERIALS)
    .required(),
  totalTonnage: Joi.number().required()
})

const materialsExample = TONNAGE_MONITORING_MATERIALS.map((material) => ({
  material,
  totalTonnage: 0
}))

export const tonnageMonitoringResponseSchema = Joi.object({
  generatedAt: Joi.string().isoDate().required(),
  materials: Joi.array()
    .items(materialTonnageSchema)
    .required()
    .example(materialsExample),
  total: Joi.number().required()
})
