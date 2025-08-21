import Boom from '@hapi/boom'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/index.js'

const path = '/v1/apply/organisation'

/**
 * Apply: Organisation
 * Stores organisation data.
 */
const organisation = {
  method: 'POST',
  path,
  options: {
    validate: {
      payload: (value, _options) => {
        if (!value || typeof value !== 'object') {
          throw Boom.badRequest('Invalid payload — must be JSON object')
        }
        return value
      }
    }
  },
  handler: async (_request, h) => {
    const logger = createLogger()

    logger.info({
      message: 'Received organisation payload',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })

    return h.response({
      orgId: 'ORG12345', // TODO: generate correctly structured orgId to be specified and done in later ticket
      orgName: 'ORGABCD', // depending on the field names from the form creators, given in the response
      referenceNumber: 'REF12345' // TODO: generate correctly structured reference number to be specified and done in later ticket
    })
  }
}

const organisationPath = path

export { organisation, organisationPath }
