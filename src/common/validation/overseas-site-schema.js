import Joi from 'joi'

import { isoDateString } from './iso-date-schema.js'

export const orsIdKey = Joi.string().pattern(/^\d{3}$/)

const accreditedOverseasSiteSchema = Joi.alternatives().try(
  Joi.object({ status: Joi.string().valid('pending').required() }),
  Joi.object({
    approvedOn: isoDateString().required(),
    status: Joi.string().valid('approved').required()
  })
)

export const accreditedOverseasSitesSchema = Joi.object().pattern(
  orsIdKey,
  accreditedOverseasSiteSchema
)
