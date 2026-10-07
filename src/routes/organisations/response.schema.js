import Joi from 'joi'
import {
  REGULATOR,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { materialSchema } from '#common/validation/material-schema.js'
import { isoDateString } from '#common/validation/iso-date-schema.js'
import {
  ACCREDITATION_STATUSES,
  ORGANISATION_STATUSES,
  REGISTRATION_STATUSES
} from '#organisation-read-model/domain/model.js'

/*
 * Routes validate responses with `stripUnknown`, so these schemas also decide
 * what is served. The first alternative that matches wins, so where one shape
 * extends another the larger comes first.
 */

const regulatorSchema = Joi.object({
  code: Joi.string()
    .valid(...Object.values(REGULATOR))
    .required()
}).required()

const yearKey = Joi.string().pattern(/^\d{4}$/)
const orsIdKey = Joi.string().pattern(/^\d{3}$/)

const isoDate = isoDateString()

const isoDateTime = Joi.string()
  .isoDate()
  .pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)

const overseasSiteViewSchema = Joi.object({
  address: Joi.object({
    country: Joi.string().required(),
    line1: Joi.string().required(),
    line2: Joi.string(),
    postcode: Joi.string(),
    stateOrRegion: Joi.string(),
    townOrCity: Joi.string().required()
  }).required(),
  coordinates: Joi.string(),
  name: Joi.string().required()
})

const overseasSitesViewSchema = Joi.object()
  .pattern(orsIdKey, overseasSiteViewSchema)
  .required()

const accreditedOverseasSiteViewSchema = Joi.alternatives().try(
  Joi.object({ status: Joi.string().valid('pending').required() }),
  Joi.object({
    approvedOn: isoDate.required(),
    status: Joi.string().valid('approved').required()
  })
)

const accreditedOverseasSitesViewSchema = Joi.object()
  .pattern(orsIdKey, accreditedOverseasSiteViewSchema)
  .required()

const accreditationCommon = {
  accreditationNumber: Joi.string().required(),
  status: Joi.string()
    .valid(...ACCREDITATION_STATUSES)
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
  exporterAccreditationSchema,
  reprocessorAccreditationSchema
)

const ukAddressSchema = Joi.alternatives().try(
  Joi.object({
    county: Joi.string(),
    line1: Joi.string().required(),
    line2: Joi.string(),
    postcode: Joi.string().required(),
    town: Joi.string().required()
  }),
  Joi.object({ fullAddress: Joi.string().required() })
)

const registrationCommon = {
  material: materialSchema.required(),
  status: Joi.string()
    .valid(...REGISTRATION_STATUSES)
    .required(),
  submittedToRegulator: regulatorSchema,
  validFrom: isoDate.required()
}

export const registrationViewSchema = Joi.alternatives().try(
  Joi.object({
    accreditations: keyedByYear(reprocessorAccreditationSchema),
    ...registrationCommon,
    reprocessingType: Joi.string()
      .valid(...Object.values(REPROCESSING_TYPE))
      .required(),
    site: Joi.object({
      address: ukAddressSchema.required()
    }).required(),
    wasteProcessingType: Joi.string()
      .valid(WASTE_PROCESSING_TYPE.REPROCESSOR)
      .required()
  }),
  Joi.object({
    accreditations: keyedByYear(exporterAccreditationSchema),
    ...registrationCommon,
    overseasSites: overseasSitesViewSchema,
    wasteProcessingType: Joi.string()
      .valid(WASTE_PROCESSING_TYPE.EXPORTER)
      .required()
  })
)

const registrationsViewSchema = Joi.object()
  .pattern(Joi.string(), registrationViewSchema)
  .required()

export const linkedDefraOrganisationViewSchema = Joi.object({
  defraOrganisation: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required()
  }).required(),
  linkedAt: isoDateTime.required(),
  linkedBy: Joi.object({ email: Joi.string().required() }).required()
})

export const organisationViewSchema = Joi.object({
  linkedDefraOrganisation: linkedDefraOrganisationViewSchema,
  name: Joi.string().required(),
  organisationNumber: Joi.number().integer().required(),
  registrations: registrationsViewSchema,
  status: Joi.string()
    .valid(...ORGANISATION_STATUSES)
    .required(),
  submittedToRegulator: regulatorSchema,
  tradingName: Joi.string()
})

export const registrationsViewResponseSchema = Joi.object({
  registrations: registrationsViewSchema
})

export const accreditationsViewResponseSchema = Joi.alternatives().try(
  Joi.object({ accreditations: keyedByYear(exporterAccreditationSchema) }),
  Joi.object({ accreditations: keyedByYear(reprocessorAccreditationSchema) })
)
