import Joi from 'joi'

const addressSchema = Joi.object({
  line1: Joi.string().required(),
  line2: Joi.string().allow(null).optional(),
  townOrCity: Joi.string().required(),
  stateOrRegion: Joi.string().allow(null).optional(),
  postcode: Joi.string().allow(null).optional()
})

export const overseasSiteInsertSchema = Joi.object({
  name: Joi.string().required(),
  address: addressSchema.required(),
  country: Joi.string().required(),
  coordinates: Joi.string().allow(null).optional(),
  validFrom: Joi.date().allow(null).optional(),
  createdAt: Joi.date().required(),
  updatedAt: Joi.date().required()
})

export const overseasSiteReadSchema = overseasSiteInsertSchema.keys({
  id: Joi.string().required()
})
