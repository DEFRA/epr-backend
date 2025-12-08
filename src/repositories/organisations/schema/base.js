import {
  PARTNER_TYPE,
  PARTNERSHIP_TYPE,
  STATUS,
  USER_ROLES
} from '#domain/organisations/model.js'
import Joi from 'joi'
import { ObjectId } from 'mongodb'

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

const baseUserSchema = Joi.object({
  fullName: Joi.string().required(),
  email: Joi.string().email().required()
})

export const userSchema = baseUserSchema
  .keys({
    phone: Joi.string().required(),
    role: Joi.string().optional(),
    title: Joi.string().optional()
  })
  .or('role', 'title')

export const collatedUserSchema = baseUserSchema.keys({
  isInitialUser: Joi.boolean().required(),
  roles: Joi.array()
    .items(Joi.string().valid(USER_ROLES.STANDARD))
    .min(1)
    .required()
})

export const linkedDefraOrganisationSchema = Joi.object({
  orgId: Joi.string().uuid().required(),
  orgName: Joi.string().required(),
  linkedBy: Joi.object({
    email: Joi.string().email().required(),
    id: Joi.string().uuid().required()
  }).required(),
  linkedAt: Joi.date().iso().required()
})

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

export const companyDetailsSchema = Joi.object({
  name: Joi.string().required(),
  tradingName: Joi.string().optional(),
  companiesHouseNumber: Joi.string()
    .regex(/^[a-zA-Z0-9]{2}\d{6}$/)
    .messages({
      'string.pattern.base':
        'companiesHouseNumber must be 8 characters (e.g., 01234567 or AC012345)'
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
