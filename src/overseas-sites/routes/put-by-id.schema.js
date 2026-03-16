import Joi from 'joi'

const addressSchema = Joi.object({
  line1: Joi.string().optional(),
  line2: Joi.string().optional(),
  townOrCity: Joi.string().optional(),
  stateOrRegion: Joi.string().optional(),
  postcode: Joi.string().optional()
})

export const overseasSiteUpdatePayloadSchema = Joi.object({
  name: Joi.string().optional(),
  address: addressSchema.optional(),
  country: Joi.string().optional(),
  coordinates: Joi.string().optional(),
  validFrom: Joi.date().allow(null).optional()
}).min(1)
