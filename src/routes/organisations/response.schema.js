import Joi from 'joi'
import {
  REGULATOR,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { materialSchema } from '#common/validation/material-schema.js'
import { yearSchema } from '#common/validation/year-schema.js'
import { isFutureYear } from '#common/helpers/dates/year.js'
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

const statusTimelineSchema = Joi.array()
  .items(
    Joi.object({
      at: isoDateTime.required(),
      status: Joi.string().required()
    })
  )
  .description(
    'Every status change, oldest first. Changes that share a time are in the order they were recorded.'
  )
  .required()

/**
 * @param {readonly string[]} statuses
 */
const statusSchema = (statuses) =>
  Joi.object({
    current: Joi.string()
      .valid(...statuses)
      .required(),
    timeline: statusTimelineSchema
  }).required()

const accreditationCommon = {
  accreditationNumber: Joi.string().required(),
  prns: Joi.object({
    open: Joi.boolean()
      .required()
      .description(
        'Whether PRNs and PERNs can still be raised and issued for the year: until the end of 31 January after it.'
      )
  }).required(),
  status: statusSchema(ACCREDITATION_STATUSES)
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
  status: statusSchema(REGISTRATION_STATUSES),
  submittedToRegulator: regulatorSchema,
  validFrom: isoDate.required()
}

const registrationViewSchema = Joi.alternatives().try(
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
  displayName: Joi.string().required(),
  linkedDefraOrganisation: linkedDefraOrganisationViewSchema,
  name: Joi.string().required(),
  organisationNumber: Joi.string().required(),
  registrations: registrationsViewSchema,
  status: Joi.object({
    current: Joi.string()
      .valid(...ORGANISATION_STATUSES)
      .required()
  }).required(),
  submittedToRegulator: regulatorSchema
})

export const organisationListResponseSchema = Joi.object({
  items: Joi.array().items(organisationViewSchema).required(),
  page: Joi.number().required(),
  pageSize: Joi.number().required(),
  totalItems: Joi.number().required(),
  totalPages: Joi.number().required()
})

const servedYear = yearSchema().custom((year, helpers) =>
  isFutureYear(year) ? helpers.error('any.invalid') : year
)

export const organisationYearsResponseSchema = Joi.object({
  years: Joi.array().items(servedYear).unique().required()
})
