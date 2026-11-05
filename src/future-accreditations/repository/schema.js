import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { TONNAGE_BAND } from '#domain/organisations/model.js'
import {
  ACCREDITATION_STATUSES,
  FUTURE_ACCREDITATIONS_FROM_YEAR
} from '#organisation-read-model/domain/model.js'

export const futureAccreditationSchema = Joi.object({
  registrationNumber: Joi.string().required(),
  year: yearSchema().min(FUTURE_ACCREDITATIONS_FROM_YEAR).required(),
  accreditationNumber: Joi.string().required(),
  prnIssuance: Joi.object({
    tonnageBand: Joi.string()
      .valid(...Object.values(TONNAGE_BAND))
      .required()
  }).required(),
  status: Joi.object({
    current: Joi.string()
      .valid(...ACCREDITATION_STATUSES)
      .required(),
    timeline: Joi.array()
      .items(
        Joi.object({
          status: Joi.string().required(),
          at: Joi.string().isoDate().required()
        })
      )
      .required()
  }).required()
})
