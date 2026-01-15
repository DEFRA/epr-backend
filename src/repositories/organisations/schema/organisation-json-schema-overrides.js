import Joi from 'joi'
import { accreditationUpdateSchema } from './accreditation.js'
import { organisationReplaceSchema } from './organisation.js'
import { registrationUpdateSchema } from './registration.js'
import { makeEditable } from './helpers.js'

/**
 * Joi schema overrides for JSON Schema compatibility.
 * These overrides fork the original domain schemas to resolve issues during
 * conversion to JSON Schema, such as incompatible types or complex
 * conditional logic that does not translate directly.
 */

export const organisationJSONSchemaOverrides = organisationReplaceSchema.keys({
  registrations: Joi.array()
    .items(makeEditable(registrationUpdateSchema))
    .default([]),
  accreditations: Joi.array()
    .items(makeEditable(accreditationUpdateSchema))
    .default([])
})
