import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/**
 * @import { RegistrationDetails } from '#domain/form-submissions/parse-submission.js'
 * @import { FormSubmissionInsertError, FormSubmissionsRepository } from '#repositories/form-submissions/port.js'
 * @import { TypedLogger } from '#common/hapi-types.js'
 */

/**
 * @param {string} path
 * @param {(dependencies: {formSubmissionsRepository: FormSubmissionsRepository, logger: TypedLogger}, details: RegistrationDetails) => Promise<void>} create
 */
export function registrationAndAccreditationHandler(path, create) {
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<RegistrationDetails> & {formSubmissionsRepository: FormSubmissionsRepository}} request
   */
  return async ({ formSubmissionsRepository, payload, logger }, h) => {
    const { orgId, referenceNumber } = payload

    try {
      await create({ formSubmissionsRepository, logger }, payload)

      return h.response().code(StatusCodes.CREATED)
    } catch (error) {
      const { schemaViolations = [] } =
        /** @type {FormSubmissionInsertError} */ (error)
      const message = `Failure on ${path} for orgId: ${orgId} and referenceNumber: ${referenceNumber}, mongo validation failures: ${schemaViolations}`

      logger.error({
        err: error,
        message,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: StatusCodes.INTERNAL_SERVER_ERROR
          }
        }
      })

      throw Boom.badImplementation(message)
    }
  }
}
