import Joi from 'joi'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REG_ACC_STATUS,
  REGULATOR,
  TONNAGE_BAND,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  formFileUploadSchema,
  idSchema,
  reprocessingTypeSchema,
  userSchema
} from './base.js'
import {
  dateRequiredWhenApprovedOrSuspended,
  requiredWhenApprovedOrSuspended,
  whenExporter,
  whenMaterial,
  whenReprocessor
} from './helpers.js'

const accreditationSiteSchema = Joi.object({
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
  tonnageBand: Joi.string()
    .valid(
      TONNAGE_BAND.UP_TO_500,
      TONNAGE_BAND.UP_TO_5000,
      TONNAGE_BAND.UP_TO_10000,
      TONNAGE_BAND.OVER_10000
    )
    .required(),
  signatories: Joi.array().items(userSchema).required().min(1),
  incomeBusinessPlan: Joi.array()
    .items(prnIncomeBusinessPlanSchema)
    .required()
    .length(REQUIRED_NUMBER_OF_BUSINESS_INCOME_PLAN)
})

export const accreditationSchema = Joi.object({
  id: idSchema,
  status: Joi.string()
    .valid(
      REG_ACC_STATUS.CREATED,
      REG_ACC_STATUS.APPROVED,
      REG_ACC_STATUS.CANCELLED,
      REG_ACC_STATUS.REJECTED,
      REG_ACC_STATUS.SUSPENDED
    )
    .forbidden(),
  validFrom: dateRequiredWhenApprovedOrSuspended(),
  validTo: dateRequiredWhenApprovedOrSuspended(),
  accreditationNumber: Joi.string()
    .when('status', requiredWhenApprovedOrSuspended)
    .default(null),
  reprocessingType: reprocessingTypeSchema,
  formSubmissionTime: Joi.date().iso().required(),
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
  prnIssuance: prnIssuanceSchema.required(),
  submitterContactDetails: userSchema.required(),
  samplingInspectionPlanPart2FileUploads: Joi.array()
    .items(formFileUploadSchema)
    .required(),
  orsFileUploads: whenExporter(
    Joi.array().items(formFileUploadSchema).required().min(1)
  )
})

export const accreditationUpdateSchema = accreditationSchema.fork(
  ['status'],
  (schema) => schema.optional()
)
