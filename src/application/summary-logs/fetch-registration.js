import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/**
 * Fetches a registration from the organisations repository
 *
 * @param {Object} params
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.loggingContext
 * @returns {Promise<Object>}
 */
export const fetchRegistration = async ({
  organisationsRepository,
  organisationId,
  registrationId,
  loggingContext
}) => {
  const registration = await organisationsRepository.findRegistrationById(
    organisationId,
    registrationId
  )

  if (!registration) {
    throw new Error(
      `Registration not found: organisationId=${organisationId}, registrationId=${registrationId}`
    )
  }

  logger.info({
    message: `Fetched registration: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return registration
}
