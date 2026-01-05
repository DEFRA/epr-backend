import Boom from '@hapi/boom'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/index.js'
import { getConfig } from '#root/config.js'

const config = getConfig()
const isProductionEnvironment = config.get('cdpEnvironment') === 'prod'

/**
 * Checks if an error is a Joi ValidationError.
 * Joi errors have an isJoi flag and a details array.
 * @param {unknown} error
 * @returns {error is import('joi').ValidationError}
 */
function isJoiValidationError(error) {
  return (
    error !== null &&
    typeof error === 'object' &&
    'isJoi' in error &&
    error.isJoi === true &&
    'details' in error &&
    Array.isArray(error.details)
  )
}

/**
 * Server-level failAction for validation errors.
 *
 * - Joi ValidationErrors: Converted to 422 with details logged in non-prod
 * - Boom errors: Passed through unchanged (preserves original status code)
 * - Other errors: Re-thrown as-is
 *
 * @param {import('../hapi-types.js').HapiRequest} request
 * @param {object} _h - Hapi response toolkit (unused)
 * @param {Error | import('@hapi/boom').Boom | import('joi').ValidationError} error
 * @returns {never}
 */
export function failAction(request, _h, error) {
  // Joi validation errors → 422 Unprocessable Entity
  if (isJoiValidationError(error)) {
    const boomError = Boom.badData(error.message, error.details)

    const message = !isProductionEnvironment
      ? `${error.message} | data: ${JSON.stringify(error.details)}`
      : error.message

    request.logger.warn({
      err: boomError,
      message,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: {
          status_code: boomError.output.statusCode
        }
      }
    })

    throw boomError
  }

  // Boom errors (e.g. from custom validate functions) → pass through unchanged
  if (error.isBoom) {
    request.logger.warn({
      err: error,
      message: error.message,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: {
          status_code: error.output.statusCode
        }
      }
    })

    throw error
  }

  // Other errors → re-throw as-is (Hapi will convert to 500)
  request.logger.warn({
    err: error,
    message: error?.message ?? String(error),
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
    },
    http: {
      response: {
        status_code: 500
      }
    }
  })

  throw error
}
