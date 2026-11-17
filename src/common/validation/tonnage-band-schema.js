import Joi from 'joi'

import { TONNAGE_BAND } from '#organisations/index.js'

export const tonnageBandSchema = Joi.string().valid(
  ...Object.values(TONNAGE_BAND)
)
