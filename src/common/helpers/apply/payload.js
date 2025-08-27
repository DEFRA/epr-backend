import Boom from '@hapi/boom'
import {
  extractAnswers,
  extractOrgId,
  extractReferenceNumber
} from './extract-answers.js'

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

  if (!referenceNumber) {
    throw Boom.badData('Could not extract referenceNumber from answers')
  }

  return { answers, orgId, rawSubmissionData: data, referenceNumber }
}
