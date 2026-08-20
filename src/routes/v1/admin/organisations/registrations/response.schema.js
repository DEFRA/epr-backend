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

/**
 * The store spells these `siteCapacityInTonnes` and `siteCapacityTimescale`,
 * repeating the object that holds them. A key says what the value is, and the
 * object it sits in says what it belongs to.
 */
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
 * `validFrom` and `validTo` are one range, and the domain already passes them
 * as one object - `isWithinAccreditationDateRange(date, { validFrom, validTo })`
 * in `common/helpers/dates/accreditation.js`. The bounds keep their names
 * because `valid` does not repeat `dateRange`, which makes this the same object
 * that helper takes.
 *
 * Each bound is nullable on its own. The store requires both only while a
 * record is approved, or approved or suspended for an accreditation, and
 * outside that each is independently optional, so the range is always present
 * and says nothing about whether it is filled in.
 */
const dateRangeSchema = Joi.object({
  validFrom: Joi.string().allow(null).required(),
  validTo: Joi.string().allow(null).required()
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
  glassRecyclingProcess: Joi.array().items(Joi.string()).optional(),
  wasteProcessingType: wasteProcessingTypeSchema.required(),
  site: siteSchema.allow(null).required()
})

/**
 * `organisationId` names the organisation that holds the registration. The rest
 * of the keys outside `application` are the ones a regulator decides: the
 * number, the dates and the reprocessing type are all recorded when the
 * registration is approved, and the status is derived from the status history.
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
 * Content as the applicant supplied it on the accreditation form. The site this
 * form asks for is the address that matches an accreditation to a registered
 * site, so the collection leaves it out: every accreditation in it matches the
 * registration named in the path, and that registration carries the site.
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
