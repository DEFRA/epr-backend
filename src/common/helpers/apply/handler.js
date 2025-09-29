import { audit } from '@defra/cdp-auditing'
import Boom from '@hapi/boom'
import {
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES,
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../enums/index.js'
import { logger } from '../logging/logger.js'

export function registrationAndAccreditationHandler(name, path, factory) {
  return async ({ db, payload }, h) => {
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
      return h.response().code(201)
    } catch (err) {
      const validationFailedForFields = getValidationFailedFields(err)
      const message = `Failure on ${path} for orgId: ${orgId} and referenceNumber: ${referenceNumber}, mongo validation failures: ${validationFailedForFields}`
      logger.error(err, {
        message,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: 500
          }
        }
      })

      throw Boom.badImplementation(message)
    }
  }
}

function getValidationFailedFields(err) {
  return (
    err?.errInfo?.details?.schemaRulesNotSatisfied
      ?.filter((rule) => rule.propertiesNotSatisfied)
      ?.flatMap((rule) => rule.propertiesNotSatisfied)
      .map((prop) => `${prop.propertyName} - ${prop.description}`) ?? []
  )
}
