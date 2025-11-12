import Joi from 'joi'
import { ObjectId } from 'mongodb'
import {
  STATUS,
  REGULATOR,
  WASTE_PROCESSING_TYPE,
  NATION,
  BUSINESS_TYPE,
  PARTNER_TYPE,
  PARTNERSHIP_TYPE,
  MATERIAL,
  TIME_SCALE,
  WASTE_PERMIT_TYPE,
  RECYCLING_PROCESS,
  TONNAGE_BAND,
  VALUE_TYPE
} from '#domain/organisations/model.js'
  TONNAGE_BAND
} from '#domain/organisations.js'

/**
 * Joi conditional validation requiring a field when status is approved or suspended
 */
const requiredWhenApprovedOrSuspended = {
  switch: [
    { is: STATUS.APPROVED, then: Joi.required() },
    { is: STATUS.SUSPENDED, then: Joi.required() }
  ],
  otherwise: Joi.optional()
}

export const idSchema = Joi.string()
  .required()
  .custom((value, helpers) => {
    if (!ObjectId.isValid(value)) {
      return helpers.error('any.invalid')
    }
    return value
  })
  .messages({
    'any.required': 'id is required',
    'string.empty': 'id cannot be empty',
    'string.base': 'id must be a string',
    'any.invalid': 'id must be a valid MongoDB ObjectId'
  })

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

const userSchema = Joi.object({
  fullName: Joi.string().required(),
  email: Joi.string().email().required(),
  phone: Joi.string().required(),
  role: Joi.string().optional(),
  title: Joi.string().optional()
}).or('role', 'title')

export const statusHistoryItemSchema = Joi.object({
  status: Joi.string()
    .valid(
      STATUS.CREATED,
      STATUS.APPROVED,
      STATUS.REJECTED,
      STATUS.SUSPENDED,
      STATUS.ARCHIVED
    )
    .required(),
  updatedAt: Joi.date().required(),
  updatedBy: idSchema.optional()
})

const companyDetailsSchema = Joi.object({
  name: Joi.string().required(),
  tradingName: Joi.string().optional(),
  registrationNumber: Joi.string()
    .regex(/^[A-Z0-9]{8}$/i)
    .messages({
      'string.pattern.base':
        'Registration number must be 8 characters (e.g., 01234567 or AC012345)'
    })
    .optional(),
  registeredAddress: addressSchema.optional(),
  address: addressSchema.optional()
})

const partnerSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string()
    .valid(PARTNER_TYPE.COMPANY, PARTNER_TYPE.INDIVIDUAL)
    .required()
})

const partnershipSchema = Joi.object({
  type: Joi.string()
    .valid(PARTNERSHIP_TYPE.LTD, PARTNERSHIP_TYPE.LTD_LIABILITY)
    .required(),
  partners: Joi.array().items(partnerSchema).optional()
})

const wasteExemptionSchema = Joi.object({
  reference: Joi.string().required(),
  exemptionCode: Joi.string().required(),
  materials: Joi.array()
    .items(
      Joi.valid(
        MATERIAL.ALUMINIUM,
        MATERIAL.FIBRE,
        MATERIAL.GLASS,
        MATERIAL.PAPER,
        MATERIAL.PLASTIC,
        MATERIAL.STEEL,
        MATERIAL.WOOD
      )
    )
    .min(1)
    .required()
})

const authorisedMaterialSchema = Joi.object({
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
  authorisedWeightInTonnes: Joi.number().optional(),
  timeScale: Joi.string()
    .valid(TIME_SCALE.WEEKLY, TIME_SCALE.MONTHLY, TIME_SCALE.YEARLY)
    .optional()
})

const wasteManagementPermitSchema = Joi.object({
  type: Joi.string()
    .valid(
      WASTE_PERMIT_TYPE.ENVIRONMENTAL_PERMIT,
      WASTE_PERMIT_TYPE.INSTALLATION_PERMIT,
      WASTE_PERMIT_TYPE.WASTE_EXEMPTION
    )
    .required(),
  permitNumber: Joi.string().optional(),
  exemptions: Joi.array().items(wasteExemptionSchema).optional(),
  authorisedMaterials: Joi.array().items(authorisedMaterialSchema).optional()
})

const siteCapacitySchema = Joi.object({
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
  siteCapacityInTonnes: Joi.number().optional(),
  siteCapacityTimescale: Joi.string()
    .valid(TIME_SCALE.WEEKLY, TIME_SCALE.MONTHLY, TIME_SCALE.YEARLY)
    .optional()
})

const siteSchema = Joi.object({
  address: addressSchema.required(),
  gridReference: Joi.string().optional(),
  siteCapacity: Joi.array().items(siteCapacitySchema).optional()
})

const inputSchema = Joi.object({
  type: Joi.string().valid(VALUE_TYPE.ACTUAL, VALUE_TYPE.ESTIMATED).optional(),
  ukPackagingWasteInTonnes: Joi.number().optional(),
  nonUkPackagingWasteInTonnes: Joi.number().optional(),
  nonPackagingWasteInTonnes: Joi.number().optional()
})

const rawMaterialInputsSchema = Joi.object({
  material: Joi.number().optional(),
  tonnage: Joi.number().optional()
})

const outputSchema = Joi.object({
  type: Joi.string().valid(VALUE_TYPE.ACTUAL, VALUE_TYPE.ESTIMATED).optional(),
  sentToAnotherSiteInTonnes: Joi.number().optional(),
  contaminantsInTonnes: Joi.number().optional(),
  processLossInTonnes: Joi.number().optional()
})

const productsMadeFromRecyclingSchema = Joi.object({
  name: Joi.string().optional(),
  weightInTonnes: Joi.number().optional()
})

const yearSchema = Joi.number().integer().min(1900).max(2100).required()

const yearlyMetricsSchema = Joi.object({
  year: yearSchema,
  input: inputSchema.optional(),
  rawMaterialInputs: rawMaterialInputsSchema.optional(),
  output: outputSchema.optional(),
  productsMadeFromRecycling: Joi.array()
    .items(productsMadeFromRecyclingSchema)
    .optional()
})

const prnIncomeBusinessPlanSchema = Joi.object({
  percentIncomeSpent: Joi.number().optional(),
  usageDescription: Joi.string().optional(),
  detailedExplanation: Joi.string().optional()
})

const prnIssuanceSchema = Joi.object({
  tonnageBand: Joi.string()
    .valid(
      TONNAGE_BAND.UP_TO_500,
      TONNAGE_BAND.UP_TO_5000,
      TONNAGE_BAND.UP_TO_10000,
      TONNAGE_BAND.OVER_10000
    )
    .optional(),
  signatories: Joi.array().items(userSchema).optional(),
  prnIncomeBusinessPlan: Joi.array()
    .items(prnIncomeBusinessPlanSchema)
    .optional()
})

const pernIncomeBusinessPlanSchema = Joi.object({
  percentIncomeSpent: Joi.number().optional(),
  usageDescription: Joi.string().optional(),
  detailedExplanation: Joi.string().optional()
})

const pernIssuanceSchema = Joi.object({
  tonnageBand: Joi.string()
    .valid(
      TONNAGE_BAND.UP_TO_500,
      TONNAGE_BAND.UP_TO_5000,
      TONNAGE_BAND.UP_TO_10000,
      TONNAGE_BAND.OVER_10000
    )
    .optional(),
  signatories: Joi.array().items(userSchema).optional(),
  pernIncomeBusinessPlan: Joi.array()
    .items(pernIncomeBusinessPlanSchema)
    .optional()
})

const formFileUploadSchema = Joi.object({
  defraFormUploadedFileId: Joi.string().required(),
  defraFormUserDownloadLink: Joi.string().uri().required(),
  s3Uri: Joi.string().optional()
})

export const registrationSchema = Joi.object({
  id: idSchema,
  status: Joi.string()
    .valid(
      STATUS.CREATED,
      STATUS.APPROVED,
      STATUS.REJECTED,
      STATUS.SUSPENDED,
      STATUS.ARCHIVED
    )
    .forbidden(),
  registrationNumber: Joi.string().when(
    'status',
    requiredWhenApprovedOrSuspended
  ),
  validFrom: Joi.date().when('status', requiredWhenApprovedOrSuspended),
  validTo: Joi.date().when('status', requiredWhenApprovedOrSuspended),
  formSubmissionTime: Joi.date().required(),
  submittedToRegulator: Joi.string()
    .valid(REGULATOR.EA, REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA)
    .required(),
  orgName: Joi.string().optional(),
  site: siteSchema.optional(),
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
  wasteProcessingType: Joi.string()
    .valid(WASTE_PROCESSING_TYPE.REPROCESSOR, WASTE_PROCESSING_TYPE.EXPORTER)
    .required(),
  accreditationId: idSchema.optional(),
  recyclingProcess: Joi.array()
    .items(
      Joi.string().valid(
        RECYCLING_PROCESS.GLASS_RE_MELT,
        RECYCLING_PROCESS.GLASS_OTHER
      )
    )
    .optional(),
  noticeAddress: addressSchema.optional(),
  wasteRegistrationNumber: Joi.string().optional(),
  wasteManagementPermits: Joi.array()
    .items(wasteManagementPermitSchema)
    .optional(),
  approvedPersons: Joi.array().items(userSchema).optional(),
  suppliers: Joi.string().optional(),
  exportPorts: Joi.array().items(Joi.string()).optional(),
  yearlyMetrics: Joi.array().items(yearlyMetricsSchema).optional(),
  plantEquipmentDetails: Joi.string().optional(),
  submitterContactDetails: userSchema.optional(),
  samplingInspectionPlanFileUploads: Joi.array()
    .items(formFileUploadSchema)
    .optional(),
  orsFileUploads: Joi.array().items(formFileUploadSchema).optional()
})

const accreditationSchema = Joi.object({
  id: idSchema,
  accreditationNumber: Joi.string().when(
    'status',
    requiredWhenApprovedOrSuspended
  ),
  status: Joi.string()
    .valid(
      STATUS.CREATED,
      STATUS.APPROVED,
      STATUS.REJECTED,
      STATUS.SUSPENDED,
      STATUS.ARCHIVED
    )
    .forbidden(),
  validFrom: Joi.date().when('status', requiredWhenApprovedOrSuspended),
  validTo: Joi.date().when('status', requiredWhenApprovedOrSuspended),
  formSubmissionTime: Joi.date().required(),
  submittedToRegulator: Joi.string()
    .valid(REGULATOR.EA, REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA)
    .required(),
  orgName: Joi.string().optional(),
  site: siteSchema.optional(),
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
  wasteProcessingType: Joi.string()
    .valid(WASTE_PROCESSING_TYPE.REPROCESSOR, WASTE_PROCESSING_TYPE.EXPORTER)
    .required(),
  prnIssuance: prnIssuanceSchema.optional(),
  pernIssuance: pernIssuanceSchema.optional(),
  businessPlan: Joi.array().items(Joi.object()).optional(),
  noticeAddress: addressSchema.optional(),
  submitterContactDetails: userSchema.optional(),
  samplingInspectionPlanFileUploads: Joi.array()
    .items(formFileUploadSchema)
    .optional(),
  orsFileUploads: Joi.array().items(formFileUploadSchema).optional()
})

const registrationUpdateSchema = registrationSchema.fork(['status'], (schema) =>
  schema.optional()
)

const accreditationUpdateSchema = accreditationSchema.fork(
  ['status'],
  (schema) => schema.optional()
)

export const organisationInsertSchema = Joi.object({
  id: idSchema,
  orgId: Joi.number().required(),
  status: Joi.string()
    .valid(
      STATUS.CREATED,
      STATUS.APPROVED,
      STATUS.REJECTED,
      STATUS.SUSPENDED,
      STATUS.ARCHIVED
    )
    .forbidden(),
  schemaVersion: Joi.number().optional(),
  version: Joi.number().optional(),
  wasteProcessingTypes: Joi.array()
    .items(
      Joi.string().valid(
        WASTE_PROCESSING_TYPE.REPROCESSOR,
        WASTE_PROCESSING_TYPE.EXPORTER
      )
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one waste processing type is required'
    }),
  reprocessingNations: Joi.array()
    .items(
      Joi.string().valid(
        NATION.ENGLAND,
        NATION.WALES,
        NATION.SCOTLAND,
        NATION.NORTHERN_IRELAND
      )
    )
    .optional(),
  businessType: Joi.string()
    .valid(
      BUSINESS_TYPE.INDIVIDUAL,
      BUSINESS_TYPE.UNINCORPORATED,
      BUSINESS_TYPE.PARTNERSHIP
    )
    .optional(),
  companyDetails: companyDetailsSchema.optional(),
  partnership: partnershipSchema.optional(),
  submitterContactDetails: userSchema.required(),
  managementContactDetails: userSchema.optional(),
  formSubmissionTime: Joi.date().required(),
  submittedToRegulator: Joi.string()
    .valid(REGULATOR.EA, REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA)
    .required(),
  registrations: Joi.array().items(registrationSchema).optional(),
  accreditations: Joi.array().items(accreditationSchema).optional()
})

const NON_UPDATABLE_FIELDS = ['id', 'version', 'schemaVersion']

const insertSchemaKeys = Object.keys(organisationInsertSchema.describe().keys)
const updatableFields = insertSchemaKeys.filter(
  (key) => !NON_UPDATABLE_FIELDS.includes(key)
)

export const organisationUpdateSchema = organisationInsertSchema
  .fork(NON_UPDATABLE_FIELDS, (schema) => schema.forbidden())
  .fork(updatableFields, (schema) => schema.optional())
  .fork(['status'], (schema) => schema.optional())
  .keys({
    registrations: Joi.array().items(registrationUpdateSchema).optional(),
    accreditations: Joi.array().items(accreditationUpdateSchema).optional()
  })
