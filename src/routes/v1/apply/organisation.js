import Boom from '@hapi/boom'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  ORG_ID_START_NUMBER,
  SCHEMA_VERSION
} from '../../../common/enums/index.js'
import { extractAnswers } from '../../../common/helpers/apply/extract-answers.js'

/*
 * Organisation endpoint
 * Purpose: The initial signup manage organisation records.
 * Provides organisation-level data to support registration and accreditation flows through org id.
 */

const organisation = {
  method: 'POST',
  path: '/v1/apply/organisation',
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

    const count = await db.collection('organisation').countDocuments({
      orgId: {
        $gte: ORG_ID_START_NUMBER
      }
    })

    db.collection('organisation').insertOne({
      orgId: ORG_ID_START_NUMBER + count + 1,
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

    return h.response({
      orgId: 'ORG12345', // TODO: generate correctly structured orgId to be specified and done in later ticket
      orgName: 'ORGABCD', // depending on the field names from the form creators, given in the response
      referenceNumber: 'REF12345' // TODO: generate correctly structured reference number to be specified and done in later ticket
    })
  }
}

export { organisation }
