import Boom from '@hapi/boom'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  SCHEMA_VERSION
} from '../../../common/enums/index.js'
import { extractAnswers } from '../../../common/helpers/apply/extract-answers.js'

/*
 * Accreditation endpoint
 * Purpose: To accredit an organisation or site under a specified accreditation type.
 * Handles accreditation details and stores them for further processing.
 */

const accreditation = {
  method: 'POST',
  path: '/v1/apply/accreditation',
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

    db.collection('accreditation').insertOne({
      schemaVersion: SCHEMA_VERSION,
      answers: extractAnswers(payload),
      rawSubmissionData: payload
    })

    logger.info({
      message: 'Received accreditation payload',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })

    return h.response()
  }
}

export { accreditation }
