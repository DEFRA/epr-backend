import Joi from 'joi'
import {
  WASTE_RECORD_TYPE,
  WASTE_RECORD_TEMPLATE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

/**
 * Composite key for uniquely identifying a waste record
 * @typedef {Object} WasteRecordKey
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} type
 * @property {string} rowId
 */

const commonMessages = {
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'any.only': '{#label} must be one of {#valids}'
}

export const organisationIdSchema = Joi.string().required().messages({
  'any.required': 'organisationId is required',
  'string.empty': 'organisationId cannot be empty',
  'string.base': 'organisationId must be a string'
})

export const registrationIdSchema = Joi.string().required().messages({
  'any.required': 'registrationId is required',
  'string.empty': 'registrationId cannot be empty',
  'string.base': 'registrationId must be a string'
})

const summaryLogReferenceSchema = Joi.object({
  id: Joi.string().required(),
  uri: Joi.string().required()
}).required()

const versionSchema = Joi.object({
  createdAt: Joi.string().isoDate().required(),
  status: Joi.string()
    .valid(...Object.values(VERSION_STATUS))
    .required(),
  summaryLog: summaryLogReferenceSchema,
  data: Joi.object().required()
}).required()

export const wasteRecordSchema = Joi.object({
  organisationId: organisationIdSchema,
  registrationId: registrationIdSchema,
  accreditationId: Joi.string().optional(),
  rowId: Joi.string().required(),
  type: Joi.string()
    .valid(...Object.values(WASTE_RECORD_TYPE))
    .required(),
  template: Joi.string()
    .valid(...Object.values(WASTE_RECORD_TEMPLATE))
    .required(),
  data: Joi.object().required(),
  versions: Joi.array().items(versionSchema).min(1).required()
}).messages(commonMessages)
