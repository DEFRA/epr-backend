import { safeAudit } from '#root/auditing/helpers.js'
import {
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES,
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  ORGANISATION_SUBMISSION_REGULATOR_CONFIRMATION_EMAIL_TEMPLATE_ID,
  ORGANISATION_SUBMISSION_USER_CONFIRMATION_EMAIL_TEMPLATE_ID
} from '#common/enums/index.js'
import { organisationSubmission } from '#domain/form-submissions/submission-records.js'
import { sendEmail } from '#common/helpers/notify.js'

/**
 * @import { TypedLogger } from '#common/hapi-types.js'
 * @import { FormSubmissionsRepository } from '#repositories/form-submissions/port.js'
 * @import { OrganisationDetails } from '#domain/form-submissions/parse-submission.js'
 */

/**
 * @typedef {Object} OrganisationConfirmation
 * @property {number} orgId
 * @property {string} orgName
 * @property {string} referenceNumber
 */

/**
 * @param {string} email
 * @param {string} regulatorEmail
 * @param {OrganisationConfirmation} context
 */
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
 * @param {{formSubmissionsRepository: FormSubmissionsRepository, logger: TypedLogger}} dependencies
 * @param {OrganisationDetails} details
 * @returns {Promise<OrganisationConfirmation>}
 */
export async function createOrganisation(
  { formSubmissionsRepository, logger },
  { answers, email, orgName, rawSubmissionData, regulatorEmail }
) {
  const orgId = await formSubmissionsRepository.allocateOrgId()

  const referenceNumber = await formSubmissionsRepository.insertOrganisation(
    organisationSubmission({
      orgId,
      orgName,
      email,
      nations: null,
      answers,
      rawSubmissionData
    })
  )

  safeAudit({
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

  return { orgId, orgName, referenceNumber }
}
