import Joi from 'joi'
import {
  MATERIAL,
  REGULATOR,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { accreditationUpdateSchema } from './accreditation.js'
import { addressSchema, reprocessingTypeSchema } from './base.js'
import {
  dateRequiredWhenApprovedOrSuspended,
  requiredWhenApprovedOrSuspended
} from './helpers.js'
import { organisationReplaceSchema } from './organisation.js'
import { registrationUpdateSchema } from './registration.js'

/**
 * Joi schema overrides for JSON Schema compatibility.
 * These overrides fork the original domain schemas to resolve issues during
 * conversion up to JSON Schema, such as incompatible types or complex
 * conditional logic that does not translate directly.
 */

const fixIdFields = (schema) => {
  const paths = ['id', 'accreditationId'].filter((p) =>
    schema.$_terms.keys.some((k) => k.key === p)
  )
  return schema.fork(paths, () => Joi.string().optional())
}

const siteCapacitySchema = Joi.object({
  material: Joi.string().required(),
  siteCapacityInTonnes: Joi.number().required(),
  siteCapacityTimescale: Joi.string().required()
})

const registrationSiteSchema = Joi.object({
  address: addressSchema.required(),
  gridReference: Joi.string().required(),
  siteCapacity: Joi.array().items(siteCapacitySchema).required().min(1)
})

const accreditationSiteSchema = Joi.object({
  address: Joi.object({
    line1: Joi.string().required(),
    postcode: Joi.string().required()
  })
})

const applyRegistrationOverrides = (schema) => {
  return schema.keys({
    registrationNumber: Joi.string()
      .allow(null)
      .default(null)
      .when('status', requiredWhenApprovedOrSuspended),
    validFrom: dateRequiredWhenApprovedOrSuspended(),
    validTo: dateRequiredWhenApprovedOrSuspended(),
    cbduNumber: Joi.string()
      .allow(null)
      .when('submittedToRegulator', {
        is: Joi.valid(REGULATOR.EA, REGULATOR.SEPA, REGULATOR.NRW),
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    reprocessingType: reprocessingTypeSchema,
    site: registrationSiteSchema.allow(null).when('wasteProcessingType', {
      is: WASTE_PROCESSING_TYPE.REPROCESSOR,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    noticeAddress: addressSchema.allow(null).when('wasteProcessingType', {
      is: WASTE_PROCESSING_TYPE.EXPORTER,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    wasteManagementPermits: Joi.array()
      .items(Joi.any())
      .allow(null)
      .when('wasteProcessingType', {
        is: WASTE_PROCESSING_TYPE.REPROCESSOR,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    yearlyMetrics: Joi.array()
      .items(Joi.any())
      .allow(null)
      .when('wasteProcessingType', {
        is: WASTE_PROCESSING_TYPE.REPROCESSOR,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    plantEquipmentDetails: Joi.string()
      .allow(null)
      .when('wasteProcessingType', {
        is: WASTE_PROCESSING_TYPE.REPROCESSOR,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    exportPorts: Joi.array()
      .items(Joi.string())
      .allow(null)
      .when('wasteProcessingType', {
        is: WASTE_PROCESSING_TYPE.EXPORTER,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    orsFileUploads: Joi.array()
      .items(Joi.any())
      .allow(null)
      .when('wasteProcessingType', {
        is: WASTE_PROCESSING_TYPE.EXPORTER,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    glassRecyclingProcess: Joi.any().allow(null).when('material', {
      is: MATERIAL.GLASS,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    samplingInspectionPlanPart1FileUploads: Joi.array()
      .items(Joi.any())
      .optional()
      .allow(null),
    wasteProcessingType: Joi.string().required(),
    material: Joi.string().required(),
    status: Joi.string().optional(),
    submittedToRegulator: Joi.string().required()
  })
}

const applyAccreditationOverrides = (schema) => {
  return schema.keys({
    accreditationNumber: Joi.string()
      .allow(null)
      .default(null)
      .when('status', requiredWhenApprovedOrSuspended),
    validFrom: dateRequiredWhenApprovedOrSuspended(),
    validTo: dateRequiredWhenApprovedOrSuspended(),
    reprocessingType: reprocessingTypeSchema,
    site: accreditationSiteSchema.allow(null).when('wasteProcessingType', {
      is: WASTE_PROCESSING_TYPE.REPROCESSOR,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    glassRecyclingProcess: Joi.array()
      .items(Joi.string())
      .allow(null)
      .when('material', {
        is: MATERIAL.GLASS,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    orsFileUploads: Joi.array().items(Joi.any()).allow(null).optional(),
    samplingInspectionPlanPart2FileUploads: Joi.array()
      .items(Joi.any())
      .allow(null)
      .optional(),
    wasteProcessingType: Joi.string().required(),
    material: Joi.string().required(),
    status: Joi.string().optional()
  })
}

const fixRegistration = (schema) => {
  const fixed = fixIdFields(schema)
  return applyRegistrationOverrides(fixed)
}

const fixAccreditation = (schema) => {
  const fixed = fixIdFields(schema)
  return applyAccreditationOverrides(fixed)
}

export const organisationJSONSchemaOverrides = organisationReplaceSchema.keys({
  registrations: Joi.array()
    .items(fixRegistration(registrationUpdateSchema))
    .default([]),
  accreditations: Joi.array()
    .items(fixAccreditation(accreditationUpdateSchema))
    .default([])
})
