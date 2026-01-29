import {
  BUSINESS_TYPE,
  NATION,
  ORGANISATION_STATUS,
  REGULATOR,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import Joi from 'joi'
import {
  accreditationSchema,
  accreditationUpdateSchema
} from './accreditation.js'
import {
  collatedUserSchema,
  companyDetailsSchema,
  idSchema,
  linkedDefraOrganisationSchema,
  partnershipSchema,
  userSchema
} from './base.js'
import { registrationSchema, registrationUpdateSchema } from './registration.js'
import { validateImmutableFields } from './helpers.js'

export { idSchema, statusHistoryItemSchema } from './base.js'
export { registrationSchema } from './registration.js'

export const organisationInsertSchema = Joi.object({
  accreditations: Joi.array().items(accreditationSchema).optional(),
  businessType: Joi.string()
    .valid(
      BUSINESS_TYPE.INDIVIDUAL,
      BUSINESS_TYPE.UNINCORPORATED,
      BUSINESS_TYPE.PARTNERSHIP
    )
    .optional(),
  companyDetails: companyDetailsSchema.required(),
  formSubmissionTime: Joi.date().iso().required(),
  id: idSchema,
  linkedDefraOrganisation: linkedDefraOrganisationSchema.optional(),
  managementContactDetails: userSchema.optional(),
  orgId: Joi.number().required(),
  partnership: partnershipSchema.optional(),
  registrations: Joi.array().items(registrationSchema).optional(),
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
  status: Joi.string()
    .valid(...Object.values(ORGANISATION_STATUS))
    .forbidden(),
  submittedToRegulator: Joi.string()
    .valid(REGULATOR.EA, REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA)
    .required(),
  submitterContactDetails: userSchema.required(),
  users: Joi.array().items(collatedUserSchema).default([]),
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
    })
})

const NON_UPDATABLE_FIELDS = ['id']

export const organisationReplaceSchema = organisationInsertSchema
  .fork(NON_UPDATABLE_FIELDS, (schema) => schema.forbidden())
  .fork(['status'], (schema) => schema.optional())
  .keys({
    schemaVersion: Joi.number().required().valid(1),
    registrations: Joi.array()
      .items(registrationUpdateSchema)
      .default([])
      .custom(validateImmutableFields(['id'])),
    accreditations: Joi.array()
      .items(accreditationUpdateSchema)
      .default([])
      .custom(validateImmutableFields(['id']))
  })

/**
 * Schema for normalising organisation documents read from the database.
 * Ensures array fields are never undefined by applying defaults.
 * Allows all other fields through unchanged - full validation is the
 * responsibility of the write path; read path just normalises.
 */
export const organisationReadSchema = Joi.object({
  registrations: Joi.array().default([]),
  accreditations: Joi.array().default([]),
  users: Joi.array().default([])
}).unknown(true)
