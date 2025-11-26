import Joi from 'joi'
import {
  BUSINESS_TYPE,
  NATION,
  REGULATOR,
  STATUS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  companyDetailsSchema,
  defraIdOrgIdSchema,
  idSchema,
  partnershipSchema,
  userSchema,
  userWithRolesSchema
} from './base.js'
import { registrationSchema, registrationUpdateSchema } from './registration.js'
import {
  accreditationSchema,
  accreditationUpdateSchema
} from './accreditation.js'

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
  defraIdOrgId: defraIdOrgIdSchema.optional(),
  formSubmissionTime: Joi.date().iso().required(),
  id: idSchema,
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
    .valid(
      STATUS.CREATED,
      STATUS.APPROVED,
      STATUS.ACTIVE,
      STATUS.REJECTED,
      STATUS.SUSPENDED,
      STATUS.ARCHIVED
    )
    .forbidden(),
  submittedToRegulator: Joi.string()
    .valid(REGULATOR.EA, REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA)
    .required(),
  submitterContactDetails: userSchema.required(),
  users: Joi.array().items(userWithRolesSchema),
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
