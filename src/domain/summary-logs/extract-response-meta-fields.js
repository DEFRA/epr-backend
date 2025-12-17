import Joi from 'joi'
import { SUMMARY_LOG_META_FIELDS, PROCESSING_TYPES } from './meta-fields.js'

const VALID_PROCESSING_TYPES = Object.values(PROCESSING_TYPES)

/**
 * Extracted response meta fields for API responses.
 * @typedef {Object} ResponseMetaFields
 * @property {string} [processingType]
 * @property {string} [material]
 * @property {string} [accreditationNumber]
 */

/**
 * Individual field schemas for validation.
 * Using individual schemas allows partial extraction - we include
 * fields that pass validation and omit those that don't.
 */
const processingTypeSchema = Joi.string()
  .valid(...VALID_PROCESSING_TYPES)
  .required()

const stringFieldSchema = Joi.string().min(1).required()

/**
 * Extracts and validates meta fields for API responses.
 *
 * Returns only the fields that should be exposed in the API response,
 * with camelCase property names. Fields that are null, missing, or
 * invalid are omitted from the result.
 *
 * This is the single source of truth for which meta fields are exposed
 * in the summary log GET response.
 *
 * @param {Record<string, unknown> | null | undefined} meta - Raw meta object from storage
 * @returns {ResponseMetaFields} Extracted fields (empty object if no valid fields)
 */
export const extractResponseMetaFields = (meta) => {
  if (!meta) {
    return {}
  }

  const result = {}

  // PROCESSING_TYPE must be one of the valid processing types
  if (
    !processingTypeSchema.validate(
      meta[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]
    ).error
  ) {
    result.processingType = meta[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]
  }

  // MATERIAL must be a non-empty string
  if (
    !stringFieldSchema.validate(meta[SUMMARY_LOG_META_FIELDS.MATERIAL]).error
  ) {
    result.material = meta[SUMMARY_LOG_META_FIELDS.MATERIAL]
  }

  // ACCREDITATION_NUMBER must be a non-empty string
  if (
    !stringFieldSchema.validate(
      meta[SUMMARY_LOG_META_FIELDS.ACCREDITATION_NUMBER]
    ).error
  ) {
    result.accreditationNumber =
      meta[SUMMARY_LOG_META_FIELDS.ACCREDITATION_NUMBER]
  }

  return result
}
