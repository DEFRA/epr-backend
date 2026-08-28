import Joi from 'joi'
import {
  ACCREDITATION_STATUS,
  MATERIAL,
  REGISTRATION_STATUS,
  REGULATOR,
  REPROCESSING_TYPE,
  TIME_SCALE,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PERMIT_TYPE,
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
 * What the record is for, once resolved. Glass is the only material that
 * sub-divides, so this reads `glass_re_melt` or `glass_other` where the store
 * holds `glass` beside a single recycling process. Plain `glass` is never a
 * resolved material: a record that carries no process, or more than one, has
 * not been split, and the key is left out rather than carrying a value the
 * record has not earned.
 */
const resolvedMaterialSchema = Joi.string().valid(
  ...TONNAGE_MONITORING_MATERIALS
)

/**
 * The material as the applicant declared it on the form, which is one of the
 * seven the form offers and so includes plain `glass`.
 */
const appliedForMaterialSchema = Joi.string().valid(...Object.values(MATERIAL))
const regulatorSchema = Joi.string().valid(...Object.values(REGULATOR))
const wasteProcessingTypeSchema = Joi.string().valid(
  ...Object.values(WASTE_PROCESSING_TYPE)
)
const reprocessingTypeSchema = Joi.string()
  .valid(...Object.values(REPROCESSING_TYPE))
  .allow(null)

const wasteExemptionSchema = Joi.object({
  reference: Joi.string().required(),
  exemptionCode: Joi.string().required(),
  materials: Joi.array().items(appliedForMaterialSchema).required()
})

const authorisedMaterialSchema = Joi.object({
  material: appliedForMaterialSchema.required(),
  authorisedWeightInTonnes: Joi.number().required(),
  timeScale: Joi.string()
    .valid(...Object.values(TIME_SCALE))
    .required()
})

/**
 * What authorises the site to handle the material. A permit is identified by
 * its number and the weights it authorises; an exemption by its reference and
 * code, so each arm carries only the keys its own kind has.
 */
const wastePermitSchema = Joi.object({
  type: Joi.string()
    .valid(...Object.values(WASTE_PERMIT_TYPE))
    .required(),
  permitNumber: Joi.string(),
  exemptions: Joi.array().items(wasteExemptionSchema),
  authorisedMaterials: Joi.array().items(authorisedMaterialSchema)
})

/**
 * Content as the applicant supplied it on the registration form, before a
 * regulator decided anything about it.
 *
 * `orgName` is one of those answers, so it is the name the applicant typed on
 * this form. It is not the organisation's name, which the organisation holds
 * once in its company details, and it is not the name Defra ID holds.
 * `material` likewise is the material they applied for, which is why it may be
 * plain `glass` where the key outside may not.
 *
 * Every answer is present whether or not it was given, an unanswered one
 * reading null or empty, so a client never has to tell a missing key from an
 * empty one. Plant equipment is asked only of a reprocessor and ports only of
 * an exporter, so each is null for the other. A site and a notice address are
 * asked of one and offered to the other, so either may carry both.
 */
const registrationApplicationSchema = Joi.object({
  orgName: Joi.string().required(),
  submittedToRegulator: regulatorSchema.required(),
  material: appliedForMaterialSchema.required(),
  wasteProcessingType: wasteProcessingTypeSchema.required(),
  cbduNumber: Joi.string().allow(null).required(),
  suppliers: Joi.string().required(),
  plantEquipmentDetails: Joi.string().allow(null).required(),
  site: siteSchema.allow(null).required(),
  wastePermits: Joi.array().items(wastePermitSchema).required(),
  noticeAddress: addressSchema.allow(null).required(),
  exportPorts: Joi.array().items(Joi.string()).allow(null).required()
})

/**
 * Enough of an accreditation to address it and to say what state it is in.
 * Its own content stays at its own address, and it is a link rather than a
 * fold, so this grows a key only where addressing the accreditation needs one.
 */
const accreditationLinkSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(ACCREDITATION_STATUS))
    .required()
})

/**
 * Apart from its own identity and the organisation it belongs to, the keys
 * outside `application` are the ones a regulator decides or a process derives:
 * the number, the dates and the reprocessing type are recorded when the
 * registration is approved, the status is derived from the status history, and
 * `material` is what the registration resolved to. That last one is the only
 * optional key: a registration that has resolved to no material carries none.
 */
export const registrationResponseSchema = Joi.object({
  id: Joi.string().required(),
  organisation: Joi.object({ id: Joi.string().required() }).required(),
  registrationNumber: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(REGISTRATION_STATUS))
    .required(),
  material: resolvedMaterialSchema,
  reprocessingType: reprocessingTypeSchema.required(),
  dateRange: dateRangeSchema.required(),
  accreditations: Joi.array().items(accreditationLinkSchema).required(),
  application: registrationApplicationSchema.required()
})

/**
 * The registrations an organisation holds, whatever their status: a regulator
 * opens the page precisely to see the ones an operator's own view leaves out.
 * The item is the member resource, so a client that reads a row and then opens
 * it is handed the same resource twice.
 */
export const registrationsResponseSchema = Joi.object({
  registrations: Joi.array().items(registrationResponseSchema).required()
})

/**
 * Content as the applicant supplied it on the accreditation form. The site the
 * form asks for is the registered site's address, which the registration named
 * in the path carries.
 */
const accreditationApplicationSchema = Joi.object({
  orgName: Joi.string().required(),
  submittedToRegulator: regulatorSchema.required(),
  material: appliedForMaterialSchema.required(),
  wasteProcessingType: wasteProcessingTypeSchema.required()
})

const accreditationSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).required(),
  status: Joi.string()
    .valid(...Object.values(ACCREDITATION_STATUS))
    .required(),
  material: resolvedMaterialSchema,
  reprocessingType: reprocessingTypeSchema.required(),
  dateRange: dateRangeSchema.required(),
  application: accreditationApplicationSchema.required()
})

export const registrationAccreditationsResponseSchema = Joi.object({
  accreditations: Joi.array().items(accreditationSchema).required()
})
