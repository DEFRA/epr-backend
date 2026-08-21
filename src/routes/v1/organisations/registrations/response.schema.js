import Joi from 'joi'
import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS,
  REGULATOR,
  REPROCESSING_TYPE,
  TONNAGE_MONITORING_MATERIALS,
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

const capacitySchema = Joi.object({
  material: Joi.string().required(),
  tonnes: Joi.number().required(),
  timescale: Joi.string().required()
})

const siteSchema = Joi.object({
  address: addressSchema.required(),
  gridReference: Joi.string().required(),
  capacity: Joi.array().items(capacitySchema).required()
})

/**
 * Each bound is nullable on its own. The store requires both only while a
 * record is approved, or approved or suspended for an accreditation, and
 * outside that each is independently optional, so the range is always present
 * and says nothing about whether it is filled in.
 */
const dateRangeSchema = Joi.object({
  validFrom: Joi.string().allow(null).required(),
  validTo: Joi.string().allow(null).required()
})

/**
 * Glass is the only material that sub-divides, and a record carries one
 * process, so `material` reads `glass_re_melt` or `glass_other` where the store
 * holds `glass` beside a process.
 */
const materialSchema = Joi.string().valid(...TONNAGE_MONITORING_MATERIALS)
const regulatorSchema = Joi.string().valid(...Object.values(REGULATOR))
const wasteProcessingTypeSchema = Joi.string().valid(
  ...Object.values(WASTE_PROCESSING_TYPE)
)
const reprocessingTypeSchema = Joi.string()
  .valid(...Object.values(REPROCESSING_TYPE))
  .allow(null)

/**
 * Content as the applicant supplied it on the registration form, before a
 * regulator decided anything about it.
 *
 * `orgName` is one of those answers, so it is the name the applicant typed on
 * this form. It is not the organisation's name, which the organisation holds
 * once in its company details, and it is not the name Defra ID holds.
 *
 * A site is optional in the store, so `site` is null for a registration that
 * holds none. An exporter is the ordinary case of that.
 */
const registrationApplicationSchema = Joi.object({
  orgName: Joi.string().required(),
  submittedToRegulator: regulatorSchema.required(),
  material: materialSchema.required(),
  wasteProcessingType: wasteProcessingTypeSchema.required(),
  site: siteSchema.allow(null).required()
})

/**
 * Apart from `organisationId`, the keys outside `application` are the ones a
 * regulator decides: the number, the dates and the reprocessing type are
 * recorded when the registration is approved, and the status is derived from
 * the status history.
 */
export const registrationResponseSchema = Joi.object({
  id: Joi.string().required(),
  organisationId: Joi.string().required(),
  registrationNumber: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(REGISTRATION_STATUS))
    .required(),
  reprocessingType: reprocessingTypeSchema.required(),
  dateRange: dateRangeSchema.required(),
  application: registrationApplicationSchema.required()
})

/**
 * Content as the applicant supplied it on the accreditation form. The site the
 * form asks for is the registered site's address, which the registration named
 * in the path carries.
 */
const accreditationApplicationSchema = Joi.object({
  orgName: Joi.string().required(),
  submittedToRegulator: regulatorSchema.required(),
  material: materialSchema.required(),
  wasteProcessingType: wasteProcessingTypeSchema.required()
})

const accreditationSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(ACCREDITATION_STATUS))
    .required(),
  reprocessingType: reprocessingTypeSchema.required(),
  dateRange: dateRangeSchema.required(),
  application: accreditationApplicationSchema.required()
})

export const registrationAccreditationsResponseSchema = Joi.object({
  accreditations: Joi.array().items(accreditationSchema).required()
})
