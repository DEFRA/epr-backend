import Joi from 'joi'
import { accreditationUpdateSchema } from './accreditation.js'
import { organisationReplaceSchema } from './organisation.js'
import { registrationUpdateSchema } from './registration.js'

/**
 * Joi schema overrides for JSON Schema compatibility.
 * These overrides fork the original domain schemas to resolve issues during
 * conversion to JSON Schema, such as incompatible types or complex
 * conditional logic that does not translate directly.
 */

const NON_EDITABLE_KEYS = new Set(['id'])

/**
 * Extracts and processes the first valid branch from a conditional schema.
 */
const unwrapConditionals = (schema, type) => {
  if (type !== 'any' || !schema.$_terms?.whens) {
    return null
  }

  const branches = schema.$_terms.whens.flatMap((w) => [
    w.then,
    w.otherwise,
    ...(w.switch || []).flatMap((s) => [s.then, s.otherwise])
  ])

  const activeBranch = branches
    .filter(Boolean)
    .find((branch) => branch.describe().flags?.presence !== 'forbidden')

  return activeBranch ? makeEditable(activeBranch) : null
}

/**
 * Recursively applies makeEditable to all keys in an object schema.
 */
const recurseObjectKeys = (schema, keys) => {
  let editableSchema = schema
  for (const key of Object.keys(keys)) {
    editableSchema = editableSchema.fork([key], (subSchema) => {
      if (NON_EDITABLE_KEYS.has(key)) {
        return subSchema.optional().allow(null).meta({ readOnly: true })
      }
      return makeEditable(subSchema)
    })
  }
  return editableSchema
}

/**
 * Transforms a Joi schema to be permissive for "edit" contexts.
 * It recurses through the schema, unwrapping conditionals and making everything
 * optional and nullable, except for specific protected keys.
 */
export const makeEditable = (schema) => {
  if (!schema?.describe) {
    return schema
  }

  const description = schema.describe()
  const unwrapped = unwrapConditionals(schema, description.type)
  if (unwrapped) {
    return unwrapped
  }

  let editableSchema = schema.clone().optional().allow(null)
  if (editableSchema.$_terms?.whens) {
    delete editableSchema.$_terms.whens
  }

  if (description.type === 'object' && description.keys) {
    editableSchema = recurseObjectKeys(editableSchema, description.keys)
  }

  if (description.type === 'array' && editableSchema.$_terms?.items) {
    editableSchema.$_terms.items =
      editableSchema.$_terms.items.map(makeEditable)
  }

  return editableSchema
}

export const organisationJSONSchemaOverrides = organisationReplaceSchema.keys({
  registrations: Joi.array()
    .items(makeEditable(registrationUpdateSchema))
    .default([]),
  accreditations: Joi.array()
    .items(makeEditable(accreditationUpdateSchema))
    .default([])
})
