import Joi from 'joi'
import { tonnageBandSchema } from '#common/validation/tonnage-band-schema.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  ACCREDITATION_STATUS,
  REGULATOR,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  accreditationStatusHistoryItemSchema,
  formFileUploadSchema,
  formSubmissionSchema,
  idSchema,
  makeReprocessingTypeSchema,
  userSchema
} from './base.js'
import {
  dateRequiredWhenApprovedOrSuspended,
  requiredWhenApprovedOrSuspended,
  whenExporter,
  whenMaterial,
  whenReprocessor
} from './helpers.js'
import { normalisedAccreditationNumberSchema } from './numbers.js'

/** @import { StringSchema } from 'joi' */
/** @import { Year } from '#common/helpers/dates/year.js' */

export const accreditationSiteSchema = Joi.object({
  address: Joi.object({
    line1: Joi.string().required(),
    postcode: Joi.string().required()
  })
})

const prnIncomeBusinessPlanSchema = Joi.object({
  percentIncomeSpent: Joi.number().required(),
  usageDescription: Joi.string().required(),
  detailedExplanation: Joi.string().required()
})

const REQUIRED_NUMBER_OF_BUSINESS_INCOME_PLAN = 7
const prnIssuanceSchema = Joi.object({
  tonnageBand: tonnageBandSchema.required(),
  signatories: Joi.array().items(userSchema).required().min(1),
  incomeBusinessPlan: Joi.array()
    .items(prnIncomeBusinessPlanSchema)
    .required()
    .length(REQUIRED_NUMBER_OF_BUSINESS_INCOME_PLAN)
})

/**
 * The only year REEX stores accreditations for. Every later accreditation is
 * held by the registration and accreditation service.
 */
export const STORED_ACCREDITATION_YEAR = /** @type {Year} */ (2026)

/** @param {StringSchema} schema */
const inStoredAccreditationYear = (schema) =>
  schema
    .custom((value, helpers) =>
      Number(value.slice(0, 4)) === STORED_ACCREDITATION_YEAR
        ? value
        : helpers.error('date.outsideStoredAccreditationYear')
    )
    .messages({
      'date.outsideStoredAccreditationYear': `must be in ${STORED_ACCREDITATION_YEAR}`
    })

export const accreditationSchema = Joi.object({
  id: idSchema,
  status: Joi.string()
    .valid(...Object.values(ACCREDITATION_STATUS))
    .forbidden(),
  validFrom: inStoredAccreditationYear(dateRequiredWhenApprovedOrSuspended()),
  validTo: inStoredAccreditationYear(dateRequiredWhenApprovedOrSuspended()),
  accreditationNumber: normalisedAccreditationNumberSchema.when(
    'status',
    requiredWhenApprovedOrSuspended
  ),
  reprocessingType: makeReprocessingTypeSchema(requiredWhenApprovedOrSuspended),
  submittedToRegulator: Joi.string()
    .valid(REGULATOR.EA, REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA)
    .required(),
  orgName: Joi.string().required(),
  site: whenReprocessor(accreditationSiteSchema),
  material: Joi.string()
    .valid(
      MATERIAL.ALUMINIUM,
      MATERIAL.FIBRE,
      MATERIAL.GLASS,
      MATERIAL.PAPER,
      MATERIAL.PLASTIC,
      MATERIAL.STEEL,
      MATERIAL.WOOD
    )
    .required(),
  glassRecyclingProcess: whenMaterial(
    MATERIAL.GLASS,
    Joi.array()
      .items(
        Joi.string().valid(
          GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
          GLASS_RECYCLING_PROCESS.GLASS_OTHER
        )
      )
      .min(1)
  ),
  wasteProcessingType: Joi.string()
    .valid(WASTE_PROCESSING_TYPE.REPROCESSOR, WASTE_PROCESSING_TYPE.EXPORTER)
    .required(),
  formSubmission: formSubmissionSchema.required(),
  prnIssuance: prnIssuanceSchema.required(),
  submitterContactDetails: userSchema.required(),
  samplingInspectionPlanPart2FileUploads: Joi.array()
    .items(formFileUploadSchema)
    .required(),
  orsFileUploads: whenExporter(
    Joi.array().items(formFileUploadSchema).required().min(1)
  )
})

// See registrationUpdateSchema — statusHistory is accepted so admins can
// correct the updatedAt dates of an existing accreditation (PAE-1809).
export const accreditationUpdateSchema = accreditationSchema
  .fork(['status'], (schema) => schema.optional())
  .keys({
    statusHistory: Joi.array()
      .items(accreditationStatusHistoryItemSchema)
      .optional()
  })
