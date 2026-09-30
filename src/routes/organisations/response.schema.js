import Joi from 'joi'
import {
  ACCREDITATION_STATUS,
  ORGANISATION_STATUS,
  REGISTRATION_STATUS,
  REGULATOR,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { materialSchema } from '#common/validation/material-schema.js'

const regulatorSchema = Joi.string()
  .valid(...Object.values(REGULATOR))
  .required()

export const accreditationViewSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(ACCREDITATION_STATUS))
    .required()
})

const yearKey = Joi.string().pattern(/^\d{4}$/)
const orsIdKey = Joi.string().pattern(/^\d{3}$/)

const accreditationsViewSchema = Joi.object()
  .pattern(yearKey, accreditationViewSchema)
  .required()

const overseasSiteViewSchema = Joi.object({
  name: Joi.string().allow(null).required(),
  country: Joi.string().allow(null).required(),
  address: Joi.object({
    line1: Joi.string().required(),
    line2: Joi.string().allow(null),
    townOrCity: Joi.string().required(),
    stateOrRegion: Joi.string().allow(null),
    postcode: Joi.string().allow(null)
  })
    .allow(null)
    .required(),
  coordinates: Joi.string().allow(null).required(),
  validFrom: Joi.string().isoDate().allow(null).required()
})

const overseasSitesViewSchema = Joi.object()
  .pattern(orsIdKey, overseasSiteViewSchema)
  .required()

export const registrationViewSchema = Joi.object({
  id: Joi.string().required(),
  registrationNumber: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(REGISTRATION_STATUS))
    .required(),
  validFrom: Joi.string().allow(null).required(),
  material: materialSchema.required(),
  wasteProcessingType: Joi.string()
    .valid(...Object.values(WASTE_PROCESSING_TYPE))
    .required(),
  reprocessingType: Joi.string()
    .valid(...Object.values(REPROCESSING_TYPE))
    .allow(null)
    .required(),
  submittedToRegulator: regulatorSchema,
  site: Joi.object({
    address: Joi.object({
      line1: Joi.string(),
      line2: Joi.string(),
      town: Joi.string(),
      county: Joi.string(),
      postcode: Joi.string()
    }).required()
  })
    .allow(null)
    .required(),
  overseasSites: overseasSitesViewSchema,
  accreditations: accreditationsViewSchema
})

export const organisationViewSchema = Joi.object({
  id: Joi.string().required(),
  orgId: Joi.number().integer().required(),
  name: Joi.string().required(),
  tradingName: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(ORGANISATION_STATUS))
    .required(),
  submittedToRegulator: regulatorSchema,
  linkedDefraOrganisation: Joi.object({
    orgId: Joi.string().required(),
    orgName: Joi.string().required(),
    linkedAt: Joi.date().required(),
    linkedBy: Joi.object({ email: Joi.string().required() }).required()
  }),
  registrations: Joi.array().items(registrationViewSchema).required()
})

export const registrationsViewSchema = Joi.object({
  registrations: Joi.array().items(registrationViewSchema).required()
})

export const accreditationsViewResponseSchema = Joi.object({
  accreditations: accreditationsViewSchema
})

export const overseasSitesViewResponseSchema = Joi.object({
  overseasSites: overseasSitesViewSchema
})
