import Joi from 'joi'
import { GLASS_RECYCLING_PROCESS, MATERIAL } from '#domain/materials.js'
import {
  REGISTRATION_STATUS,
  REGULATOR,
  TIME_SCALE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  addressSchema,
  formFileUploadSchema,
  formSubmissionSchema,
  idSchema,
  makeReprocessingTypeSchema,
  userSchema
} from './base.js'
import { wasteManagementPermitSchema } from './waste-permits.js'
import { yearlyMetricsSchema } from './metrics.js'
import {
  CURRENT_SCHEMA_VERSION,
  dateRequiredWhenApproved,
  requiredForExporterOptionalForReprocessor,
  requiredForReprocessor,
  requiredForReprocessorOptionalForExporter,
  requiredWhenApproved,
  whenExporter,
  whenMaterial,
  whenReprocessor
} from './helpers.js'

const siteCapacitySchema = Joi.object({
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
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

const overseasSiteEntrySchema = Joi.object({
  overseasSiteId: Joi.string().required()
})

const overseasSitesMapSchema = Joi.object().pattern(
  Joi.string().pattern(/^\d{3}$/),
  overseasSiteEntrySchema
)

export const registrationSchema = Joi.object({
  id: idSchema,
  status: Joi.string()
    .valid(...Object.values(REGISTRATION_STATUS))
    .forbidden(),
  registrationNumber: Joi.string()
    .when('status', requiredWhenApproved)
    .default(null),
  reprocessingType: makeReprocessingTypeSchema(requiredWhenApproved),
  validFrom: dateRequiredWhenApproved(),
  validTo: dateRequiredWhenApproved(),
  submittedToRegulator: Joi.string()
    .valid(REGULATOR.EA, REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA)
    .required(),
  orgName: Joi.string().required(),
  site: requiredForReprocessorOptionalForExporter(registrationSiteSchema),
  material: Joi.string()
    .valid(...Object.values(MATERIAL))
    .required(),
  wasteProcessingType: Joi.string()
    .valid(WASTE_PROCESSING_TYPE.REPROCESSOR, WASTE_PROCESSING_TYPE.EXPORTER)
    .required(),
  accreditationId: idSchema.optional(),
  formSubmission: formSubmissionSchema.required(),
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
  applicationContactDetails: Joi.when('/schemaVersion', {
    is: Joi.number().required().min(CURRENT_SCHEMA_VERSION),
    then: userSchema.required(),
    otherwise: userSchema.optional()
  }),
  samplingInspectionPlanPart1FileUploads: Joi.array()
    .items(formFileUploadSchema)
    .required(),
  orsFileUploads: whenExporter(
    Joi.array().items(formFileUploadSchema).required().min(1)
  ),
  overseasSites: Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.EXPORTER,
    then: overseasSitesMapSchema.optional(),
    otherwise: Joi.forbidden()
  })
})

export const registrationUpdateSchema = registrationSchema.fork(
  ['status'],
  (schema) => schema.optional()
)
