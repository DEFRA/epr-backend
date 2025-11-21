import { ROLES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'
import { ObjectId } from 'mongodb'
import {
  STATUS,
  PARTNER_TYPE,
  PARTNERSHIP_TYPE
} from '#domain/organisations/model.js'

export const defraIdOrgIdSchema = Joi.string().required().messages({
  'any.required': 'id is required',
  'string.empty': 'id cannot be empty',
  'string.base': 'id must be a string'
})

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

export const addressSchema = Joi.object({
  line1: Joi.string().optional(),
  line2: Joi.string().optional(),
  town: Joi.string().optional(),
  county: Joi.string().optional(),
  country: Joi.string().optional(),
  postcode: Joi.string().optional(),
  region: Joi.string().optional(),
  fullAddress: Joi.string().optional()
})

export const userSchema = Joi.object({
  fullName: Joi.string().required(),
  email: Joi.string().email().required(),
  phone: Joi.string().required(),
  role: Joi.string().optional(),
  title: Joi.string().optional()
}).or('role', 'title')

export const userWithRolesSchema = Joi.object({
  fullName: Joi.string().required(),
  email: Joi.string().email().required(),
  roles: Joi.array().items(ROLES.standardUser).optional(),
  isInitialUser: Joi.boolean()
})

export const statusHistoryItemSchema = Joi.object({
  status: Joi.string()
    .valid(
      STATUS.CREATED,
      STATUS.APPROVED,
      STATUS.ACTIVE,
      STATUS.REJECTED,
      STATUS.SUSPENDED,
      STATUS.ARCHIVED
    )
    .required(),
  updatedAt: Joi.date().iso().required(),
  updatedBy: idSchema.optional()
})

export const companyDetailsSchema = Joi.object({
  name: Joi.string().required(),
  tradingName: Joi.string().optional(),
  registrationNumber: Joi.string()
    .regex(/^[a-zA-Z0-9]{2}\d{6}$/)
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

export const partnershipSchema = Joi.object({
  type: Joi.string()
    .valid(PARTNERSHIP_TYPE.LTD, PARTNERSHIP_TYPE.LTD_LIABILITY)
    .required(),
  partners: Joi.array().items(partnerSchema).optional()
})

export const formFileUploadSchema = Joi.object({
  defraFormUploadedFileId: Joi.string().required(),
  defraFormUserDownloadLink: Joi.string().uri().required(),
  s3Uri: Joi.string().optional()
})
