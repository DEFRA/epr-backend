import Joi from 'joi'
import {
  ACCREDITATION_STATUS,
  MATERIAL,
  REGISTRATION_STATUS,
  REGULATOR,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

const addressSchema = Joi.object({
  line1: Joi.string().optional(),
  line2: Joi.string().optional(),
  town: Joi.string().optional(),
  county: Joi.string().optional(),
  country: Joi.string().optional(),
  postcode: Joi.string().optional(),
  region: Joi.string().optional(),
  fullAddress: Joi.string().optional()
})

const siteCapacitySchema = Joi.object({
  siteCapacityInTonnes: Joi.number().required(),
  material: Joi.string().required(),
  siteCapacityTimescale: Joi.string().required()
})

const siteSchema = Joi.object({
  address: addressSchema.required(),
  gridReference: Joi.string().required(),
  siteCapacity: Joi.array().items(siteCapacitySchema).required()
})

const materialSchema = Joi.string().valid(...Object.values(MATERIAL))
const regulatorSchema = Joi.string().valid(...Object.values(REGULATOR))
const wasteProcessingTypeSchema = Joi.string().valid(
  ...Object.values(WASTE_PROCESSING_TYPE)
)
const reprocessingTypeSchema = Joi.string()
  .valid(...Object.values(REPROCESSING_TYPE))
  .allow(null)

/**
 * A site is optional in the store, so `site` is null for a registration that
 * holds none. An exporter is the ordinary case of that.
 */
export const registrationResponseSchema = Joi.object({
  id: Joi.string().required(),
  organisationId: Joi.string().required(),
  orgName: Joi.string().required(),
  registrationNumber: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(REGISTRATION_STATUS))
    .required(),
  material: materialSchema.required(),
  glassRecyclingProcess: Joi.array().items(Joi.string()).optional(),
  wasteProcessingType: wasteProcessingTypeSchema.required(),
  reprocessingType: reprocessingTypeSchema.required(),
  submittedToRegulator: regulatorSchema.required(),
  validFrom: Joi.string().allow(null).required(),
  validTo: Joi.string().allow(null).required(),
  site: siteSchema.allow(null).required()
})

/**
 * An accreditation's site records only the line and postcode that identify it,
 * which is a narrower address than a registration site carries.
 */
const accreditationSiteSchema = Joi.object({
  address: Joi.object({
    line1: Joi.string().required(),
    postcode: Joi.string().required()
  }).optional()
})

const accreditationSchema = Joi.object({
  id: Joi.string().required(),
  orgName: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(ACCREDITATION_STATUS))
    .required(),
  material: materialSchema.required(),
  wasteProcessingType: wasteProcessingTypeSchema.required(),
  reprocessingType: reprocessingTypeSchema.required(),
  submittedToRegulator: regulatorSchema.required(),
  validFrom: Joi.string().allow(null).required(),
  validTo: Joi.string().allow(null).required(),
  site: accreditationSiteSchema.allow(null).required()
})

export const registrationAccreditationsResponseSchema = Joi.object({
  accreditations: Joi.array().items(accreditationSchema).required()
})
