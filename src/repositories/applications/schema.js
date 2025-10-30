import Joi from 'joi'

const answerSchema = Joi.object({
  shortDescription: Joi.string().required(),
  title: Joi.string().required(),
  type: Joi.string().required(),
  value: Joi.string().allow('').required()
}).unknown(false)

export const accreditationSchema = Joi.object({
  schemaVersion: Joi.number().required(),
  createdAt: Joi.date().required(),
  orgId: Joi.number().required(),
  referenceNumber: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required(),
  answers: Joi.array().items(answerSchema).required(),
  rawSubmissionData: Joi.object().required()
}).unknown(false)

export const registrationSchema = Joi.object({
  schemaVersion: Joi.number().required(),
  createdAt: Joi.date().required(),
  orgId: Joi.number().required(),
  referenceNumber: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required(),
  answers: Joi.array().items(answerSchema).required(),
  rawSubmissionData: Joi.object().required()
}).unknown(false)

export const organisationSchema = Joi.object({
  schemaVersion: Joi.number().required(),
  createdAt: Joi.date().required(),
  orgId: Joi.number().required(),
  orgName: Joi.string().required(),
  email: Joi.string().email().required(),
  nations: Joi.array().items(Joi.string()).allow(null).required(),
  answers: Joi.array().items(answerSchema).required(),
  rawSubmissionData: Joi.object().required()
}).unknown(false)
