import Joi from 'joi'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { customJoi } from '#common/validation/custom-joi.js'
import { checkTemplateVersion } from '#domain/summary-logs/table-schemas/index.js'

/** @import {Year} from '#common/helpers/dates/year.js' */

const VALID_PROCESSING_TYPES = [
  PROCESSING_TYPES.REPROCESSOR_INPUT,
  PROCESSING_TYPES.REPROCESSOR_OUTPUT,
  PROCESSING_TYPES.EXPORTER,
  PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
  PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
]

const IS_REQUIRED = 'is required'

/**
 * Creates a Joi schema for meta section fields (ADR 0055 for TEMPLATE_VERSION)
 *
 * @param {Object} options
 * @param {Year} options.year - The summary log's year
 * @returns {Joi.ObjectSchema}
 */
export const createMetaSchema = ({ year }) => {
  return Joi.object({
    PROCESSING_TYPE: customJoi
      .coercedString()
      .valid(...VALID_PROCESSING_TYPES)
      .required()
      .messages({
        'any.only': `must be one of: ${VALID_PROCESSING_TYPES.join(', ')}`,
        'any.required': IS_REQUIRED
      }),
    TEMPLATE_VERSION: Joi.number()
      .required()
      .custom((version, helpers) => {
        const processingType = helpers.state.ancestors[0].PROCESSING_TYPE
        if (!VALID_PROCESSING_TYPES.includes(processingType)) {
          return version
        }

        const failure = checkTemplateVersion({ year, processingType, version })
        return failure ? helpers.error(failure.error, failure.context) : version
      })
      .messages({
        'any.required': IS_REQUIRED,
        'number.min': 'must be at least {#limit}',
        'number.max': 'must be at most {#limit}',
        'templateVersion.year': 'must be a template for a supported year',
        'templateVersion.yearMismatch': 'must be a template for {#year}'
      }),
    REGISTRATION_NUMBER: customJoi.coercedString().required().messages({
      'any.required': IS_REQUIRED
    }),
    ACCREDITATION_NUMBER: customJoi.coercedString().optional().allow(null, '')
  }).unknown(true) // Allow other fields that might be present
}
