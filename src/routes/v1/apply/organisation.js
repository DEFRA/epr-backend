import { audit } from '@defra/cdp-auditing'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES,
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  ORGANISATION_SUBMISSION_REGULATOR_CONFIRMATION_EMAIL_TEMPLATE_ID,
  ORGANISATION_SUBMISSION_USER_CONFIRMATION_EMAIL_TEMPLATE_ID
} from '#common/enums/index.js'
import {
  extractAnswers,
  extractEmail,
  extractOrgName,
  getRegulatorEmail
} from '#common/helpers/apply/extract-answers.js'
import { organisationFactory } from '#common/helpers/collections/factories/index.js'
import { sendEmail } from '#common/helpers/notify.js'

export const organisationPath = '/v1/apply/organisation'

async function sendConfirmationEmails(email, regulatorEmail, context) {
  await sendEmail(
    ORGANISATION_SUBMISSION_USER_CONFIRMATION_EMAIL_TEMPLATE_ID,
    email,
    context
  )

  await sendEmail(
    ORGANISATION_SUBMISSION_REGULATOR_CONFIRMATION_EMAIL_TEMPLATE_ID,
    regulatorEmail,
    context
  )
}

/**
 * Apply: Organisation
 * Stores organisation data.
 */
export const organisation = {
  method: 'POST',
  path: organisationPath,
  options: {
    validate: {
      payload: (data, _options) => {
        if (!data || typeof data !== 'object') {
          throw Boom.badRequest('Invalid payload')
        }

        const answers = extractAnswers(data)
        const email = extractEmail(answers)
        const orgName = extractOrgName(answers)
        const regulatorEmail = getRegulatorEmail(data)

        if (!regulatorEmail) {
          throw Boom.badData('Could not get regulator name from data')
        }

        if (!email) {
          throw Boom.badData('Could not extract email from answers')
        }

        if (!orgName) {
          throw Boom.badData('Could not extract organisation name from answers')
        }

        return {
          answers,
          email,
          orgName,
          rawSubmissionData: data,
          regulatorEmail
        }
      }
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest} request
   */
  handler: async ({ applicationsRepository, payload, logger }, h) => {
    const { answers, email, orgName, rawSubmissionData, regulatorEmail } =
      payload

    try {
      const { orgId, referenceNumber } =
        await applicationsRepository.insertOrganisation(
          organisationFactory({
            orgId: 0,
            orgName,
            email,
            nations: null,
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
          orgName,
          referenceNumber
        }
      })

      logger.info({
        message: `Stored organisation data for orgId: ${orgId} and referenceNumber: ${referenceNumber}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      await sendConfirmationEmails(email, regulatorEmail, {
        orgId,
        orgName,
        referenceNumber
      })

      return h.response({
        orgId,
        orgName,
        referenceNumber
      })
    } catch (error) {
      const message = `Failure on ${organisationPath}`

      logger.error({
        error,
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
