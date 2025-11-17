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
  GLASS_RECYCLING_PROCESS,
  TONNAGE_BAND,
  VALUE_TYPE
} from '#domain/organisations/model.js'

const whenReprocessor = (schema) =>
  Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.REPROCESSOR,
    then: schema.required(),
    otherwise: Joi.forbidden()
  })

const whenExporter = (schema) =>
  Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.EXPORTER,
    then: schema.required(),
    otherwise: Joi.forbidden()
  })

const requiredForReprocessor = (baseSchema) =>
  baseSchema.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.REPROCESSOR,
    then: Joi.required(),
    otherwise: Joi.forbidden()
  })

const requiredForReprocessorOptionalForExporter = (schema) =>
  Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.REPROCESSOR,
    then: schema.required(),
    otherwise: schema.optional()
  })

const requiredForExporterOptionalForReprocessor = (schema) =>
  Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.EXPORTER,
    then: schema.required(),
    otherwise: schema.optional()
  })

const whenMaterial = (material, schema) =>
  Joi.when('material', {
    is: material,
    then: schema.required(),
    otherwise: Joi.forbidden()
  })

const whenWasteExemption = (schema) =>
  Joi.when('type', {
    is: WASTE_PERMIT_TYPE.WASTE_EXEMPTION,
    then: schema.required(),
    otherwise: Joi.forbidden()
  })

const whenNotWasteExemption = (schema) =>
  Joi.when('type', {
    is: WASTE_PERMIT_TYPE.WASTE_EXEMPTION,
    then: Joi.forbidden(),
    otherwise: schema.required()
  })

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
  updatedAt: Joi.date().iso().required(),
  updatedBy: idSchema.optional()
})

const companyDetailsSchema = Joi.object({
  name: Joi.string().required(),
  tradingName: Joi.string().optional(),
  registrationNumber: Joi.string()
    .regex(/^[a-zA-Z0-9]{2}[0-9]{6}$/)
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
  authorisedWeightInTonnes: Joi.number().required(),
  timeScale: Joi.string()
    .valid(TIME_SCALE.WEEKLY, TIME_SCALE.MONTHLY, TIME_SCALE.YEARLY)
    .required()
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
  exemptions: whenWasteExemption(
    Joi.array().items(wasteExemptionSchema).min(1)
  ),
  authorisedMaterials: whenNotWasteExemption(
    Joi.array().items(authorisedMaterialSchema).min(1)
  )
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

const registrationSiteSchema = Joi.object({
  address: addressSchema.required(),
  gridReference: Joi.string().required(),
  siteCapacity: Joi.array().items(siteCapacitySchema).required().min(1)
})

const accreditationSiteSchema = Joi.object({
  line1: Joi.string().required(),
  postcode: Joi.string().required()
})

const inputSchema = Joi.object({
  type: Joi.string().valid(VALUE_TYPE.ACTUAL, VALUE_TYPE.ESTIMATED).required(),
  ukPackagingWasteInTonnes: Joi.number().required(),
  nonUkPackagingWasteInTonnes: Joi.number().required(),
  nonPackagingWasteInTonnes: Joi.number().required()
})

const rawMaterialInputsSchema = Joi.object({
  material: Joi.string().required(),
  weightInTonnes: Joi.number().required()
})

const outputSchema = Joi.object({
  type: Joi.string().valid(VALUE_TYPE.ACTUAL, VALUE_TYPE.ESTIMATED).required(),
  sentToAnotherSiteInTonnes: Joi.number().required(),
  contaminantsInTonnes: Joi.number().required(),
  processLossInTonnes: Joi.number().required()
})

const productsMadeFromRecyclingSchema = Joi.object({
  name: Joi.string().required(),
  weightInTonnes: Joi.number().required()
})

const START_YEAR = 2024
const MAX_YEAR = 2100
const yearSchema = Joi.number()
  .integer()
  .min(START_YEAR)
  .max(MAX_YEAR)
  .required()

const yearlyMetricsSchema = Joi.object({
  year: yearSchema,
  input: inputSchema.required(),
  rawMaterialInputs: Joi.array()
    .items(rawMaterialInputsSchema)
    .required()
    .min(1),
  output: outputSchema.required(),
  productsMadeFromRecycling: Joi.array()
    .items(productsMadeFromRecyclingSchema)
    .required()
    .min(1)
})

const prnIncomeBusinessPlanSchema = Joi.object({
  percentIncomeSpent: Joi.number().required(),
  usageDescription: Joi.string().required(),
  detailedExplanation: Joi.string().required()
})

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
    .min(1)
})

const formFileUploadSchema = Joi.object({
  defraFormUploadedFileId: Joi.string().required(),
  defraFormUserDownloadLink: Joi.string().uri().required(),
  s3Uri: Joi.string().optional()
})

export const registrationSchema = Joi.object({
  id: idSchema,
  statusHistory: Joi.array().items(statusHistoryItemSchema),
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
  validFrom: Joi.date().iso().when('status', requiredWhenApprovedOrSuspended),
  validTo: Joi.date().iso().when('status', requiredWhenApprovedOrSuspended),
  formSubmissionTime: Joi.date().iso().required(),
  submittedToRegulator: Joi.string()
    .valid(REGULATOR.EA, REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA)
    .required(),
  orgName: Joi.string().required(),
  site: requiredForReprocessorOptionalForExporter(registrationSiteSchema),
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
  noticeAddress: requiredForExporterOptionalForReprocessor(addressSchema),
  cbduNumber: Joi.string()
    .min(8)
    .max(10)
    .regex(/^[cC][bB][dD][uU]/)
    .required()
    .messages({
      'string.pattern.base':
        'CBDU number must start with CBDU (case insensitive)',
      'string.min': 'CBDU number must be at least 8 characters',
      'string.max': 'CBDU number must be at most 10 characters'
    }),
  wasteManagementPermits: whenReprocessor(
    Joi.array().items(wasteManagementPermitSchema).required().min(1)
  ),
  approvedPersons: Joi.array().items(userSchema).required().min(1),
  suppliers: Joi.string().required(),
  exportPorts: whenExporter(Joi.array().items(Joi.string()).required().min(1)),
  yearlyMetrics: whenReprocessor(
    Joi.array().items(yearlyMetricsSchema).required().min(1)
  ),
  plantEquipmentDetails: requiredForReprocessor(Joi.string()),
  submitterContactDetails: userSchema.required(),
  samplingInspectionPlanPart1FileUploads: Joi.array()
    .items(formFileUploadSchema)
    .required()
    .min(1),
  orsFileUploads: whenExporter(
    Joi.array().items(formFileUploadSchema).required().min(1)
  )
})

const accreditationSchema = Joi.object({
  id: idSchema,
  accreditationNumber: Joi.string().when(
    'status',
    requiredWhenApprovedOrSuspended
  ),
  statusHistory: Joi.array().items(statusHistoryItemSchema),
  status: Joi.string()
    .valid(
      STATUS.CREATED,
      STATUS.APPROVED,
      STATUS.REJECTED,
      STATUS.SUSPENDED,
      STATUS.ARCHIVED
    )
    .forbidden(),
  validFrom: Joi.date().iso().when('status', requiredWhenApprovedOrSuspended),
  validTo: Joi.date().iso().when('status', requiredWhenApprovedOrSuspended),
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
  wasteProcessingType: Joi.string()
    .valid(WASTE_PROCESSING_TYPE.REPROCESSOR, WASTE_PROCESSING_TYPE.EXPORTER)
    .required(),
  prnIssuance: prnIssuanceSchema.required(),
  submitterContactDetails: userSchema.required(),
  samplingInspectionPlanPart2FileUploads: Joi.array()
    .items(formFileUploadSchema)
    .required()
    .min(1),
  orsFileUploads: whenExporter(
    Joi.array().items(formFileUploadSchema).required().min(1)
  )
})

const registrationUpdateSchema = registrationSchema
  .fork(['statusHistory'], (schema) => schema.forbidden())
  .fork(['status'], (schema) => schema.optional())

const accreditationUpdateSchema = accreditationSchema
  .fork(['statusHistory'], (schema) => schema.forbidden())
  .fork(['status'], (schema) => schema.optional())

export const organisationInsertSchema = Joi.object({
  id: idSchema,
  orgId: Joi.number().required(),
  statusHistory: Joi.array().items(statusHistoryItemSchema),
  status: Joi.string()
    .valid(
      STATUS.CREATED,
      STATUS.APPROVED,
      STATUS.REJECTED,
      STATUS.SUSPENDED,
      STATUS.ARCHIVED
    )
    .forbidden(),
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
  companyDetails: companyDetailsSchema.required(),
  partnership: partnershipSchema.optional(),
  submitterContactDetails: userSchema.required(),
  managementContactDetails: userSchema.optional(),
  formSubmissionTime: Joi.date().iso().required(),
  submittedToRegulator: Joi.string()
    .valid(REGULATOR.EA, REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA)
    .required(),
  registrations: Joi.array().items(registrationSchema).optional(),
  accreditations: Joi.array().items(accreditationSchema).optional()
})

export const NON_UPDATABLE_FIELDS = ['id']

const insertSchemaKeys = Object.keys(organisationInsertSchema.describe().keys)
const updatableFields = insertSchemaKeys.filter(
  (key) => !NON_UPDATABLE_FIELDS.includes(key)
)

export const organisationUpdateSchema = organisationInsertSchema
  .fork(NON_UPDATABLE_FIELDS, (schema) => schema.forbidden())
  .fork(updatableFields, (schema) => schema.optional())
  .keys({
    registrations: Joi.array().items(registrationUpdateSchema).optional(),
    accreditations: Joi.array().items(accreditationUpdateSchema).optional()
  })
