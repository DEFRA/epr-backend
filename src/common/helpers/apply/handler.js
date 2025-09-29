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
      const message = `Failure on ${path} for orgId: ${orgId} and referenceNumber: ${referenceNumber}, validation failed on fields: ${validationFailedForFields}`

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
  const details = err?.errInfo?.details?.schemaRulesNotSatisfied;
  if (!details) return [];

  const failedFields = [];
  details.forEach(rule => {
    if (rule.propertiesNotSatisfied) {
      rule.propertiesNotSatisfied.forEach(prop => {
        failedFields.push(prop.propertyName);
      });
    }
  });

  return [...new Set(failedFields)];
}
