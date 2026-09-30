import Joi from 'joi'
import {
  ACCREDITATION_STATUS,
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REPROCESSING_TYPE,
  TONNAGE_BAND
} from '#domain/organisations/model.js'

/**
 * The scheme year every accreditation held in `epr-organisations` belongs to.
 * Accreditations for later years are held by the registration service, so this
 * service can only answer for this one (ADR 0034).
 */
export const LOCALLY_HELD_YEAR = 2026

export const MIN_YEAR = new Date('2000-01-01').getUTCFullYear()
export const MAX_YEAR = new Date('2100-01-01').getUTCFullYear()

const DATED_STATUSES = [
  ACCREDITATION_STATUS.APPROVED,
  ACCREDITATION_STATUS.SUSPENDED
]

/** `Date | string` in the model: a Date at rest, an ISO string over JSON. */
const dateSchema = Joi.date()

/**
 * `User`. Stored contacts also carry the `jobTitle` the forms collect, which
 * the type leaves out.
 */
const userSchema = Joi.object({
  fullName: Joi.string().required(),
  email: Joi.string().required(),
  phone: Joi.string().required(),
  role: Joi.string(),
  title: Joi.string(),
  jobTitle: Joi.string()
})

/** `FormFileUpload` */
const formFileUploadSchema = Joi.object({
  defraFormUploadedFileId: Joi.string().required(),
  defraFormUserDownloadLink: Joi.string().required(),
  s3Uri: Joi.string()
})

/**
 * `StatusHistoryEntry`. Stored entries may also record who made the change.
 */
const statusHistoryEntrySchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(ACCREDITATION_STATUS))
    .required(),
  updatedAt: dateSchema.required(),
  updatedBy: Joi.string()
})

/** `PrnIssuance` */
const prnIssuanceSchema = Joi.object({
  incomeBusinessPlan: Joi.array()
    .items(
      Joi.object({
        detailedExplanation: Joi.string().required(),
        percentIncomeSpent: Joi.number().required(),
        usageDescription: Joi.string().required()
      })
    )
    .required(),
  signatories: Joi.array().items(userSchema).required(),
  tonnageBand: Joi.string()
    .valid(...Object.values(TONNAGE_BAND))
    .required()
})

/**
 * An approved or suspended accreditation carries its number and validity
 * window (`AccreditationApproved`); any other may lack them
 * (`AccreditationOther`), which stored documents record as null.
 *
 * @param {Joi.Schema} schema
 */
const requiredWhenDated = (schema) =>
  Joi.when('status', {
    is: Joi.valid(...DATED_STATUSES),
    then: schema.required(),
    otherwise: schema.allow(null)
  })

/**
 * `Accreditation` from `#domain/organisations/accreditation.js`: an
 * accreditation exactly as the organisations model holds it.
 *
 * Fields the model does not name pass through, at every level: stored data can
 * differ from the model, and Hapi answers a response that fails its schema with
 * a 500, so a strict schema would fail every read of an organisation holding
 * such a field. Loose (via `allowUnknown`) while this is a POC.
 */
export const accreditationResponseSchema = Joi.object({
  id: Joi.string().required(),
  status: Joi.string()
    .valid(...Object.values(ACCREDITATION_STATUS))
    .required(),
  statusHistory: Joi.array().items(statusHistoryEntrySchema).required(),
  accreditationNumber: requiredWhenDated(Joi.string()),
  validFrom: requiredWhenDated(dateSchema),
  validTo: requiredWhenDated(dateSchema),
  // Required by the organisations schema, but not every stored accreditation
  // has one - relaxing for POC
  formSubmission: Joi.object({
    id: Joi.string().required(),
    time: dateSchema.required()
  }),
  glassRecyclingProcess: Joi.array()
    .items(Joi.string().valid(...Object.values(GLASS_RECYCLING_PROCESS)))
    .allow(null),
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  orgName: Joi.string().required(),
  orsFileUploads: Joi.array().items(formFileUploadSchema),
  prnIssuance: prnIssuanceSchema.required(),
  // Stored as null until set: the organisations schema defaults it to null
  reprocessingType: Joi.string()
    .valid(...Object.values(REPROCESSING_TYPE))
    .allow(null),
  samplingInspectionPlanPart2FileUploads: Joi.array()
    .items(formFileUploadSchema)
    .required(),
  site: Joi.object({
    address: Joi.object({
      line1: Joi.string().required(),
      postcode: Joi.string().required()
    }).required()
  }),
  submittedToRegulator: Joi.string().required(),
  submitterContactDetails: userSchema.required(),
  wasteProcessingType: Joi.string().required()
})
  .prefs({ allowUnknown: true })
  .label('Accreditation')
