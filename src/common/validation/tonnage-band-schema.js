import Joi from 'joi'

import { TONNAGE_BAND } from '#shared/organisations/model.js'

export const tonnageBandSchema = Joi.string().valid(
  ...Object.values(TONNAGE_BAND)
)
