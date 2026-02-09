import Joi from 'joi'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const statusValues = Object.values(PRN_STATUS)

const organisationNameAndIdSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  tradingName: Joi.string().optional()
})

const siteAddressSchema = Joi.object({
  line1: Joi.string().required(),
  line2: Joi.string().optional(),
  town: Joi.string().optional(),
  county: Joi.string().optional(),
  postcode: Joi.string().required(),
  country: Joi.string().optional()
})

const accreditationSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().required(),
  accreditationYear: Joi.number().integer().required(),
  material: Joi.string().required(),
  submittedToRegulator: Joi.string()
    .valid('ea', 'nrw', 'sepa', 'niea')
    .required(),
  glassRecyclingProcess: Joi.string().when('material', {
    is: 'glass',
    then: Joi.string().optional(),
    otherwise: Joi.forbidden()
  }),
  siteAddress: siteAddressSchema.optional()
})

const userSummarySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required()
})

const issuedBySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  position: Joi.string().allow('').required()
})

const statusHistoryItemSchema = Joi.object({
  status: Joi.string()
    .valid(...statusValues)
    .required(),
  updatedAt: Joi.date().required(),
  updatedBy: userSummarySchema.required()
})

const statusSchema = Joi.object({
  currentStatus: Joi.string()
    .valid(...statusValues)
    .required(),
  history: Joi.array().items(statusHistoryItemSchema).min(1).required()
})

export const prnInsertSchema = Joi.object({
  schemaVersion: Joi.number().integer().valid(2).required(),
  prnNumber: Joi.string().allow(null).optional(),
  organisation: organisationNameAndIdSchema.required(),
  registrationId: Joi.string().required(),
  accreditation: accreditationSchema.required(),
  issuedToOrganisation: organisationNameAndIdSchema.required(),
  tonnage: Joi.number().required(),
  isExport: Joi.boolean().required(),
  notes: Joi.string().optional(),
  isDecemberWaste: Joi.boolean().required(),
  issuedAt: Joi.date().allow(null).required(),
  issuedBy: issuedBySchema.allow(null).required(),
  status: statusSchema.required(),
  createdAt: Joi.date().required(),
  createdBy: userSummarySchema.required(),
  updatedAt: Joi.date().required(),
  updatedBy: userSummarySchema.allow(null).required()
})
