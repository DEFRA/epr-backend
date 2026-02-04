import Joi from 'joi'
import {
  MATERIAL,
  GLASS_RECYCLING_PROCESS
} from '#domain/organisations/model.js'

const tonnageMonitoringMaterials = Object.values(MATERIAL)
  .filter((m) => m !== MATERIAL.GLASS)
  .concat(Object.values(GLASS_RECYCLING_PROCESS))

const materialTonnageSchema = Joi.object({
  material: Joi.string()
    .valid(...tonnageMonitoringMaterials)
    .required(),
  totalTonnage: Joi.number().required()
})

const materialsExample = tonnageMonitoringMaterials.map((material) => ({
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
