import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  ORG_ID_START_NUMBER
} from '../../enums/index.js'
import {
  extractAnswers,
  extractOrgId,
  extractReferenceNumber
} from './extract-answers.js'
import { logger } from '../logging/logger.js'

export function registrationAndAccreditationPayload(data, _options) {
  if (!data || typeof data !== 'object') {
    throw Boom.badRequest('Invalid payload')
  }

  const answers = extractAnswers(data)
  const orgId = extractOrgId(answers)
  const referenceNumber = extractReferenceNumber(answers)

  if (!orgId) {
    throw Boom.badData('Could not extract orgId from answers')
  }

  if (orgId < ORG_ID_START_NUMBER) {
    logger.warn({
      message: `orgId: ${orgId}, referenceNumber: ${referenceNumber} - Organisation ID must be at least ${ORG_ID_START_NUMBER}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: {
          status_code: StatusCodes.UNPROCESSABLE_ENTITY
        }
      }
    })
    throw Boom.badData(
      `Organisation ID must be at least ${ORG_ID_START_NUMBER}`
    )
  }

  if (!referenceNumber) {
    throw Boom.badData('Could not extract referenceNumber from answers')
  }

  return { answers, orgId, rawSubmissionData: data, referenceNumber }
}
