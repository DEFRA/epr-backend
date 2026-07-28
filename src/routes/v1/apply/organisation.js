import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createOrganisation } from '#application/form-submissions/create-organisation.js'
import { parseOrganisationSubmission } from '#domain/form-submissions/parse-submission.js'
import { validateApplyPayload } from './validate-payload.js'

export const organisationPath = '/v1/apply/organisation'

/** @import { OrganisationDetails } from '#domain/form-submissions/parse-submission.js' */
/** @import { FormSubmissionsRepository } from '#repositories/form-submissions/port.js' */

/**
 * Apply: Organisation
 * Stores organisation data.
 */
export const organisation = {
  method: 'POST',
  path: organisationPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      payload: validateApplyPayload(parseOrganisationSubmission)
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<OrganisationDetails> & {formSubmissionsRepository: FormSubmissionsRepository}} request
   */
  handler: async ({ formSubmissionsRepository, payload, logger }, h) => {
    try {
      return h.response(
        await createOrganisation({ formSubmissionsRepository, logger }, payload)
      )
    } catch (error) {
      const message = `Failure on ${organisationPath}`

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
