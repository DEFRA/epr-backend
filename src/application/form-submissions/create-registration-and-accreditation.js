import { safeAudit } from '#root/auditing/helpers.js'
import {
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES,
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  accreditationSubmission,
  registrationSubmission
} from '#domain/form-submissions/submission-records.js'

/**
 * @import { TypedLogger } from '#common/hapi-types.js'
 * @import { FormSubmissionsRepository } from '#repositories/form-submissions/port.js'
 * @import { RegistrationDetails } from '#domain/form-submissions/parse-submission.js'
 */

/**
 * @typedef {{formSubmissionsRepository: FormSubmissionsRepository, logger: TypedLogger}} Dependencies
 */

/**
 * Registrations and accreditations are both filed against an organisation that
 * already holds an orgId, so storing either is the same piece of work.
 *
 * @param {{entity: string, store: () => Promise<unknown>, logger: TypedLogger}} work
 * @param {RegistrationDetails} details
 */
async function storeAgainstOrganisation(
  { entity, store, logger },
  { orgId, referenceNumber }
) {
  await store()

  safeAudit({
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
    message: `Stored ${entity} data for orgId: ${orgId} and referenceNumber: ${referenceNumber}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
    }
  })
}

/**
 * @param {Dependencies} dependencies
 * @param {RegistrationDetails} details
 */
export async function createRegistration(
  { formSubmissionsRepository, logger },
  details
) {
  await storeAgainstOrganisation(
    {
      entity: 'registration',
      store: () =>
        formSubmissionsRepository.insertRegistration(
          registrationSubmission(details)
        ),
      logger
    },
    details
  )
}

/**
 * @param {Dependencies} dependencies
 * @param {RegistrationDetails} details
 */
export async function createAccreditation(
  { formSubmissionsRepository, logger },
  details
) {
  await storeAgainstOrganisation(
    {
      entity: 'accreditation',
      store: () =>
        formSubmissionsRepository.insertAccreditation(
          accreditationSubmission(details)
        ),
      logger
    },
    details
  )
}
