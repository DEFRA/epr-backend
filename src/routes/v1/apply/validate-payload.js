import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SUBMISSION_REJECTION } from '#domain/form-submissions/submission-rejection.js'
import { logger as globalLogger } from '#common/helpers/logging/logger.js'

/** @import { SubmissionRejection } from '#domain/form-submissions/submission-rejection.js' */

/**
 * An orgId below the minimum means the submitter quoted an identifier the
 * service never issued, which is worth a log line as well as a rejection.
 *
 * @param {SubmissionRejection} rejection
 */
function warnIfNoteworthy(rejection) {
  if (rejection.code !== SUBMISSION_REJECTION.ORG_ID_BELOW_MINIMUM) {
    return
  }

  const { message, context } = rejection

  globalLogger.warn({
    message: `orgId: ${context.orgId}, referenceNumber: ${context.referenceNumber} - ${message}`,
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
}

/**
 * Turns a domain parser into a Hapi payload validator: shape failures become
 * 400s, business rejections become 422s carrying the domain's own message.
 *
 * @template T
 * @param {(data: object) => {submission?: T, rejection?: SubmissionRejection}} parse
 * @returns {(data: unknown, options?: unknown) => T | undefined}
 */
export const validateApplyPayload = (parse) => (data, _options) => {
  if (!data || typeof data !== 'object') {
    throw Boom.badRequest('Invalid payload')
  }

  const { submission, rejection } = parse(data)

  if (rejection) {
    warnIfNoteworthy(rejection)
    throw Boom.badData(rejection.message)
  }

  return submission
}
