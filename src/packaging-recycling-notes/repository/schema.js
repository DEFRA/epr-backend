import Joi from 'joi'

import {
  MATERIAL,
  GLASS_RECYCLING_PROCESS
} from '#domain/organisations/model.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const materialValues = Object.values(MATERIAL)
const glassProcessValues = Object.values(GLASS_RECYCLING_PROCESS)

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
  material: Joi.string()
    .valid(...materialValues)
    .required(),
  submittedToRegulator: Joi.string()
    .valid('ea', 'nrw', 'sepa', 'niea')
    .required(),
  glassRecyclingProcess: Joi.when('material', {
    is: MATERIAL.GLASS,
    then: Joi.string()
      .valid(...glassProcessValues)
      .required(),
    otherwise: Joi.forbidden()
  }),
  siteAddress: siteAddressSchema.optional()
})

const userSummarySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required()
})

const actorSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  position: Joi.string().optional()
})

const businessOperationSchema = Joi.object({
  at: Joi.date().required(),
  by: actorSchema.required()
})

const statusHistoryItemSchema = Joi.object({
  status: Joi.string()
    .valid(...statusValues)
    .required(),
  at: Joi.date().required(),
  by: actorSchema.required()
})

const statusSchema = Joi.object({
  currentStatus: Joi.string()
    .valid(...statusValues)
    .required(),
  currentStatusAt: Joi.date().required(),
  created: businessOperationSchema.optional(),
  issued: businessOperationSchema.optional(),
  accepted: businessOperationSchema.optional(),
  rejected: businessOperationSchema.optional(),
  cancelled: businessOperationSchema.optional(),
  deleted: businessOperationSchema.optional(),
  history: Joi.array().items(statusHistoryItemSchema).min(1).required()
})

export const prnInsertSchema = Joi.object({
  schemaVersion: Joi.number().integer().valid(2).required(),
  prnNumber: Joi.string().allow(null).optional(),
  organisation: organisationNameAndIdSchema.required(),
  registrationId: Joi.string().required(),
  accreditation: Joi.when('isExport', {
    is: true,
    then: accreditationSchema.required(),
    otherwise: accreditationSchema
      .keys({ siteAddress: siteAddressSchema.required() })
      .required()
  }),
  issuedToOrganisation: organisationNameAndIdSchema.required(),
  tonnage: Joi.number().positive().required(),
  isExport: Joi.boolean().required(),
  notes: Joi.string().optional(),
  isDecemberWaste: Joi.boolean().required(),
  status: statusSchema.required(),
  createdAt: Joi.date().required(),
  createdBy: userSummarySchema.required(),
  updatedAt: Joi.date().required(),
  updatedBy: userSummarySchema.allow(null).required()
})
