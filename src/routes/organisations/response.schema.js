import Joi from 'joi'
import {
  ORGANISATION_STATUS,
  REGULATOR,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { materialSchema } from '#common/validation/material-schema.js'
import {
  SERVED_ACCREDITATION_STATUSES,
  SERVED_REGISTRATION_STATUSES
} from './organisation-view.js'

const regulatorSchema = Joi.object({
  code: Joi.string()
    .valid(...Object.values(REGULATOR))
    .required()
}).required()

const yearKey = Joi.string().pattern(/^\d{4}$/)
const orsIdKey = Joi.string().pattern(/^\d{3}$/)

const isoDate = Joi.string().isoDate()

export const overseasSiteViewSchema = Joi.object({
  name: Joi.string().required(),
  address: Joi.object({
    line1: Joi.string().required(),
    line2: Joi.string(),
    townOrCity: Joi.string().required(),
    stateOrRegion: Joi.string(),
    postcode: Joi.string(),
    country: Joi.string().required()
  }).required(),
  coordinates: Joi.string()
})

export const overseasSitesViewSchema = Joi.object()
  .pattern(orsIdKey, overseasSiteViewSchema)
  .required()

export const accreditedOverseasSiteViewSchema = Joi.alternatives().try(
  Joi.object({ status: Joi.string().valid('pending').required() }),
  Joi.object({
    status: Joi.string().valid('approved').required(),
    approvedOn: isoDate.required()
  })
)

export const accreditedOverseasSitesViewSchema = Joi.object()
  .pattern(orsIdKey, accreditedOverseasSiteViewSchema)
  .required()

const accreditationCommon = {
  accreditationNumber: Joi.string().required(),
  status: Joi.string()
    .valid(...SERVED_ACCREDITATION_STATUSES)
    .required()
}

const reprocessorAccreditationSchema = Joi.object(accreditationCommon)

const exporterAccreditationSchema = Joi.object({
  ...accreditationCommon,
  overseasSites: accreditedOverseasSitesViewSchema
})

/**
 * @param {Joi.Schema} schema
 */
const keyedByYear = (schema) => Joi.object().pattern(yearKey, schema).required()

export const accreditationViewSchema = Joi.alternatives().try(
  reprocessorAccreditationSchema,
  exporterAccreditationSchema
)

const registrationCommon = {
  status: Joi.string()
    .valid(...SERVED_REGISTRATION_STATUSES)
    .required(),
  validFrom: isoDate.required(),
  material: materialSchema.required(),
  submittedToRegulator: regulatorSchema
}

export const registrationViewSchema = Joi.alternatives().try(
  Joi.object({
    ...registrationCommon,
    wasteProcessingType: Joi.string()
      .valid(WASTE_PROCESSING_TYPE.REPROCESSOR)
      .required(),
    reprocessingType: Joi.string()
      .valid(...Object.values(REPROCESSING_TYPE))
      .required(),
    site: Joi.object({
      address: Joi.object({
        line1: Joi.string(),
        line2: Joi.string(),
        town: Joi.string(),
        county: Joi.string(),
        postcode: Joi.string()
      }).required()
    }).required(),
    accreditations: keyedByYear(reprocessorAccreditationSchema)
  }),
  Joi.object({
    ...registrationCommon,
    wasteProcessingType: Joi.string()
      .valid(WASTE_PROCESSING_TYPE.EXPORTER)
      .required(),
    overseasSites: overseasSitesViewSchema,
    accreditations: keyedByYear(exporterAccreditationSchema)
  })
)

const registrationsViewSchema = Joi.object()
  .pattern(Joi.string(), registrationViewSchema)
  .required()

export const organisationViewSchema = Joi.object({
  organisationNumber: Joi.number().integer().required(),
  name: Joi.string().required(),
  tradingName: Joi.string(),
  status: Joi.string()
    .valid(...Object.values(ORGANISATION_STATUS))
    .required(),
  submittedToRegulator: regulatorSchema,
  linkedDefraOrganisation: Joi.object({
    defraOrganisation: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    linkedAt: Joi.date().iso().required(),
    linkedBy: Joi.object({ email: Joi.string().required() }).required()
  }),
  registrations: registrationsViewSchema
})

export const registrationsViewResponseSchema = Joi.object({
  registrations: registrationsViewSchema
})

export const accreditationsViewResponseSchema = Joi.alternatives().try(
  Joi.object({ accreditations: keyedByYear(reprocessorAccreditationSchema) }),
  Joi.object({ accreditations: keyedByYear(exporterAccreditationSchema) })
)

export const overseasSitesViewResponseSchema = Joi.object({
  overseasSites: overseasSitesViewSchema
})

export const accreditedOverseasSitesViewResponseSchema = Joi.object({
  overseasSites: accreditedOverseasSitesViewSchema
})
