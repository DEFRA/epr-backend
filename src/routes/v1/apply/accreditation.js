import Boom from '@hapi/boom'
import {
  extractAnswers,
  extractOrgId,
  extractReferenceNumber
} from '../../../common/helpers/apply/extract-answers.js'
import { accreditationFactory } from '../../../common/helpers/collections/factories/index.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'

const path = '/v1/apply/accreditation'

const accreditationPath = path

/**
 * Apply: Accreditation
 * Stores accreditation data an activity/site/material combinations against an orgId and referenceNumber.
 */
const accreditation = {
  method: 'POST',
  path,
  options: {
    validate: {
      payload: (data, _options) => {
        if (!data || typeof data !== 'object') {
          throw Boom.badRequest('Invalid payload')
        }

        const answers = extractAnswers(data)
        const orgId = extractOrgId(answers)
        const referenceNumber = extractReferenceNumber(answers)

        if (!orgId) {
          throw Boom.badRequest('Could not extract orgId from answers')
        }

        if (!referenceNumber) {
          throw Boom.badRequest(
            'Could not extract referenceNumber from answers'
          )
        }

        return { answers, orgId, rawSubmissionData: data, referenceNumber }
      }
    }
  },
  handler: async ({ db, payload }, h) => {
    const { answers, orgId, rawSubmissionData, referenceNumber } = payload
    const logger = createLogger()

    try {
      await db.collection('accreditation').insertOne(
        accreditationFactory({
          orgId,
          referenceNumber,
          answers,
          rawSubmissionData
        })
      )

      logger.info({
        message: `Stored accreditation data for orgId: ${orgId} and referenceNumber: ${referenceNumber}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })
      return h.response().code(201)
    } catch (err) {
      const message = `Failure on ${accreditationPath}`

      logger.error(err, {
        message,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(message)
    }
  }
}

export { accreditation, accreditationPath }
