import Joi from 'joi'
import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { capitalize } from '#common/helpers/formatters.js'

const WASTE_PROCESSING_TYPES = Object.values(WASTE_PROCESSING_TYPE).map(
  capitalize
)

const monthTonnageSchema = Joi.object({
  month: Joi.string()
    .valid(
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sept',
      'Oct',
      'Nov',
      'Dec'
    )
    .required(),
  tonnage: Joi.number().required()
})

const materialTonnageSchema = Joi.object({
  material: Joi.string()
    .valid(...TONNAGE_MONITORING_MATERIALS)
    .required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
  type: Joi.string()
    .valid(...WASTE_PROCESSING_TYPES)
    .required(),
  months: Joi.array().items(monthTonnageSchema).min(1).required()
})

export const tonnageMonitoringResponseSchema = Joi.object({
  generatedAt: Joi.string().isoDate().required(),
  materials: Joi.array().items(materialTonnageSchema).required(),
  total: Joi.number().required()
})
