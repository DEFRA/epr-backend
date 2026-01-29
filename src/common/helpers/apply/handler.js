import { audit } from '@defra/cdp-auditing'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES,
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../enums/index.js'

/**
 * @typedef {{answers: object, orgId: string, rawSubmissionData: object, referenceNumber: string}} RegistrationPayload
 */

export function registrationAndAccreditationHandler(name, path, factory) {
  /**
   * @param {import('../../hapi-types.js').HapiRequest<RegistrationPayload>} request
   */
  return async ({ db, payload, logger }, h) => {
    const { answers, orgId, rawSubmissionData, referenceNumber } = payload

    try {
      await db.collection(name).insertOne(
        factory({
          orgId,
          referenceNumber,
          answers,
          rawSubmissionData
        })
      )

      audit({
        event: {
          category: AUDIT_EVENT_CATEGORIES.DB,
          action: AUDIT_EVENT_ACTIONS.DB_INSERT
        },
        context: {
          orgId,
          referenceNumber
        }
      })

      logger.info({
        message: `Stored ${name} data for orgId: ${orgId} and referenceNumber: ${referenceNumber}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })
      return h.response().code(StatusCodes.CREATED)
    } catch (error) {
      const validationFailedForFields = getValidationFailedFields(error)
      const message = `Failure on ${path} for orgId: ${orgId} and referenceNumber: ${referenceNumber}, mongo validation failures: ${validationFailedForFields}`
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

function getValidationFailedFields(error) {
  return (
    error?.errInfo?.details?.schemaRulesNotSatisfied
      ?.filter((rule) => rule.propertiesNotSatisfied)
      ?.flatMap((rule) => rule.propertiesNotSatisfied)
      .map((prop) => `${prop.propertyName} - ${prop.description}`) ?? []
  )
}
