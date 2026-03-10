import Joi from 'joi'

const addressSchema = Joi.object({
  line1: Joi.string().required(),
  line2: Joi.string().optional(),
  townOrCity: Joi.string().required(),
  stateOrRegion: Joi.string().optional(),
  postcode: Joi.string().optional()
})

export const overseasSiteCreatePayloadSchema = Joi.object({
  name: Joi.string().required(),
  address: addressSchema.required(),
  country: Joi.string().required(),
  coordinates: Joi.string().optional(),
  validFrom: Joi.date().allow(null).optional()
})
