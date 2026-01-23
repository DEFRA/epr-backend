import Joi from 'joi'

import { PRN_STATUS } from './status.js'

/**
 * PRN Joi validation schemas
 * @see docs/architecture/discovery/pepr-lld.md#PRN
 */

// Common field schemas
const objectIdSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .description('MongoDB ObjectId')

const uuidSchema = Joi.string().uuid().description('UUID v4')

const userSummarySchema = Joi.object({
  _id: objectIdSchema.required().description('User ID'),
  name: Joi.string().required().description('User name')
}).description('User summary')

const userSummaryWithPositionSchema = Joi.object({
  _id: objectIdSchema.required().description('User ID'),
  organisationId: objectIdSchema.required().description('Organisation ID'),
  name: Joi.string().required().description('User name'),
  position: Joi.string().required().description('User position in organisation')
}).description('User summary with position')

// PRN issued to organisation schema
export const prnIssuedToOrganisationSchema = Joi.object({
  _id: objectIdSchema.required().description('Organisation ID'),
  name: Joi.string().required().description('Organisation name'),
  tradingName: Joi.string().optional().description('Organisation trading name')
}).description('Organisation the PRN is issued to')

// PRN status version schema
export const prnStatusVersionSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(PRN_STATUS))
    .required()
    .description('PRN status'),
  createdAt: Joi.date().iso().required().description('Status change timestamp'),
  createdBy: userSummarySchema
    .allow(null)
    .description('User who changed status')
}).description('PRN status history entry')

// Full PRN entity schema
export const prnEntitySchema = Joi.object({
  _id: objectIdSchema.required().description('PRN ID'),
  organisationId: objectIdSchema.required().description('Organisation ID'),
  registrationId: objectIdSchema.required().description('Registration ID'),
  accreditationId: objectIdSchema.required().description('Accreditation ID'),
  schemaVersion: Joi.number()
    .integer()
    .min(1)
    .required()
    .description('Schema version'),
  createdAt: Joi.date().iso().required().description('Creation timestamp'),
  createdBy: userSummarySchema
    .required()
    .description('User who created the PRN'),
  updatedAt: Joi.date().iso().allow(null).description('Last update timestamp'),
  updatedBy: userSummarySchema.allow(null).description('User who last updated'),
  isExport: Joi.boolean()
    .required()
    .description('Whether this is an export PRN'),
  isDecemberWaste: Joi.boolean()
    .required()
    .description('Whether this is December waste'),
  prnNumber: Joi.string().required().description('PRN reference number'),
  accreditationYear: Joi.number()
    .integer()
    .min(2000)
    .max(2100)
    .required()
    .description('Accreditation year (YYYY)'),
  tonnage: Joi.number()
    .precision(2)
    .min(0)
    .required()
    .description('Tonnage in tonnes'),
  notes: Joi.string().max(200).allow('', null).description('Additional notes'),
  issuedTo: prnIssuedToOrganisationSchema
    .allow(null)
    .description('Organisation the PRN is issued to'),
  authorisedAt: Joi.date()
    .iso()
    .allow(null)
    .description('Authorisation timestamp'),
  authorisedBy: userSummaryWithPositionSchema
    .allow(null)
    .description('User who authorised the PRN'),
  status: Joi.array()
    .items(prnStatusVersionSchema)
    .required()
    .description('Status history')
}).description('Packaging Recycling Note entity')

// POST /packaging-recycling-notes - Create PRN payload
export const prnCreatePayloadSchema = Joi.object({
  organisationId: uuidSchema.required().description('Organisation ID'),
  accreditationId: uuidSchema.required().description('Accreditation ID')
}).description('PRN creation payload')

// POST /packaging-recycling-notes response
export const prnCreateResponseSchema = Joi.object({
  prnId: uuidSchema.required().description('Created PRN ID')
}).description('PRN creation response')

// PATCH /packaging-recycling-notes/{id} - Update PRN payload
export const prnUpdatePayloadSchema = Joi.object({
  tonnage: Joi.number()
    .precision(2)
    .min(0)
    .optional()
    .description('Tonnage in tonnes (two decimal places)'),
  issuedToOrganisation: Joi.object({
    id: uuidSchema.required().description('Organisation ID'),
    name: Joi.string().required().description('Organisation name'),
    tradingName: Joi.string()
      .optional()
      .description('Organisation trading name')
  })
    .optional()
    .description('Organisation to issue PRN to'),
  notes: Joi.string()
    .max(200)
    .allow('')
    .optional()
    .description('Additional notes (max 200 characters)')
}).description('PRN update payload')

// POST /packaging-recycling-notes/{id}/status - Update status payload
export const prnStatusUpdatePayloadSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(PRN_STATUS))
    .required()
    .description('New PRN status')
}).description('PRN status update payload')

// Path parameter schemas
export const prnIdParamSchema = Joi.object({
  id: uuidSchema.required().description('PRN ID')
}).description('PRN ID path parameter')

export const prnOrganisationParamsSchema = Joi.object({
  organisationId: uuidSchema.required().description('Organisation ID'),
  id: uuidSchema.required().description('PRN ID')
}).description('PRN organisation path parameters')
