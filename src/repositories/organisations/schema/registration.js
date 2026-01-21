import Joi from 'joi'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REG_ACC_STATUS,
  REGULATOR,
  TIME_SCALE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  addressSchema,
  formFileUploadSchema,
  idSchema,
  reprocessingTypeSchema,
  userSchema
} from './base.js'
import { wasteManagementPermitSchema } from './waste-permits.js'
import { yearlyMetricsSchema } from './metrics.js'
import {
  dateRequiredWhenApprovedOrSuspended,
  requiredForExporterOptionalForReprocessor,
  requiredForReprocessor,
  requiredForReprocessorOptionalForExporter,
  requiredWhenApprovedOrSuspended,
  whenExporter,
  whenMaterial,
  whenReprocessor
} from './helpers.js'

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
  siteCapacityInTonnes: Joi.number().required(),
  siteCapacityTimescale: Joi.string()
    .valid(TIME_SCALE.WEEKLY, TIME_SCALE.MONTHLY, TIME_SCALE.YEARLY)
    .required()
})

const siteAddressSchema = addressSchema.fork(['line1', 'postcode'], (schema) =>
  schema.required()
)

export const registrationSiteSchema = Joi.object({
  address: siteAddressSchema.required(),
  gridReference: Joi.string().required(),
  siteCapacity: Joi.array().items(siteCapacitySchema).required().min(1)
})

export const exportPortsSchema = Joi.array().items(Joi.string())

export const registrationSchema = Joi.object({
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
  registrationNumber: Joi.string()
    .when('status', requiredWhenApprovedOrSuspended)
    .default(null),
  reprocessingType: reprocessingTypeSchema,
  validFrom: dateRequiredWhenApprovedOrSuspended(),
  validTo: dateRequiredWhenApprovedOrSuspended(),
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
      .max(1)
  ),
  noticeAddress: requiredForExporterOptionalForReprocessor(addressSchema),
  cbduNumber: Joi.when('submittedToRegulator', {
    is: Joi.valid(REGULATOR.EA),
    then: Joi.string()
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
    otherwise: Joi.when('submittedToRegulator', {
      is: Joi.valid(REGULATOR.SEPA, REGULATOR.NRW),
      then: Joi.string().required(),
      otherwise: Joi.string().optional()
    })
  }),
  wasteManagementPermits: Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.REPROCESSOR,
    then: Joi.array().items(wasteManagementPermitSchema).min(1).required(),
    otherwise: Joi.array().items(wasteManagementPermitSchema).optional()
  }),
  approvedPersons: Joi.array().items(userSchema).required().min(1),
  suppliers: Joi.string().required(),
  exportPorts: whenExporter(exportPortsSchema.required().min(1)),
  yearlyMetrics: whenReprocessor(
    Joi.array().items(yearlyMetricsSchema).required().min(1)
  ),
  plantEquipmentDetails: requiredForReprocessor(Joi.string()),
  submitterContactDetails: userSchema.required(),
  samplingInspectionPlanPart1FileUploads: Joi.array()
    .items(formFileUploadSchema)
    .required(),
  orsFileUploads: whenExporter(
    Joi.array().items(formFileUploadSchema).required().min(1)
  )
})

export const registrationUpdateSchema = registrationSchema.fork(
  ['status'],
  (schema) => schema.optional()
)
