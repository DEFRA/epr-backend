import Boom from '@hapi/boom'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import { extractAnswers } from '../../../common/helpers/apply/extract-answers.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  SCHEMA_VERSION
} from '../../../common/enums/index.js'

/*
 * Registration endpoint
 * Purpose: To register an applicant organisation.
 * Handles initial organisation details and stores them for further processing.
 */

const registration = {
  method: 'POST',
  path: '/v1/apply/registration',
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
  handler: async ({ db, payload }, h) => {
    const logger = createLogger()

    db.collection('registration').insertOne({
      schemaVersion: SCHEMA_VERSION,
      answers: extractAnswers(payload),
      rawSubmissionData: payload
    })

    logger.info({
      message: 'Received registration payload',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })
    return h.response()
  }
}

export { registration }
