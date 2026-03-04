import { PermanentError } from '#server/queue-consumer/permanent-error.js'

/**
 * @typedef {object} RecalculateBalanceDependencies
 * @property {object} organisationsRepository
 * @property {object} wasteRecordsRepository
 * @property {object} wasteBalancesRepository
 * @property {object} logger
 */

/**
 * Finds the organisation that contains the given accreditation.
 * @param {string} accreditationId
 * @param {object} organisationsRepository
 * @returns {Promise<{organisationId: string, organisation: object}>}
 */
const findOrganisationForAccreditation = async (
  accreditationId,
  organisationsRepository
) => {
  const allIds = await organisationsRepository.findAllIds()

  if (!allIds.accreditations.has(accreditationId)) {
    throw new PermanentError(
      `Accreditation ${accreditationId} not found in any organisation`
    )
  }

  for (const organisationId of allIds.organisations) {
    const org = await organisationsRepository.findById(organisationId)
    const hasAccreditation = org.accreditations?.some(
      (a) => a.id === accreditationId
    )

    if (hasAccreditation) {
      return { organisationId, organisation: org }
    }
  }

  /* c8 ignore next 3 - defensive: findAllIds confirmed the accreditation exists */
  throw new PermanentError(
    `Accreditation ${accreditationId} not found in any organisation`
  )
}

/**
 * Finds the registration linked to the given accreditation.
 * @param {object} organisation
 * @param {string} accreditationId
 * @returns {{ registrationId: string } | null}
 */
const findLinkedRegistration = (organisation, accreditationId) => {
  const registration = organisation.registrations?.find(
    (r) => r.accreditationId === accreditationId
  )

  if (!registration) {
    return null
  }

  return { registrationId: registration.id }
}

/**
 * Recalculates the waste balance for the given accreditation by fetching
 * all waste records and reprocessing them through the balance calculator.
 *
 * @param {string} accreditationId
 * @param {RecalculateBalanceDependencies} deps
 * @returns {Promise<void>}
 */
export const recalculateBalance = async (accreditationId, deps) => {
  const {
    organisationsRepository,
    wasteRecordsRepository,
    wasteBalancesRepository,
    logger
  } = deps

  const { organisationId, organisation } =
    await findOrganisationForAccreditation(
      accreditationId,
      organisationsRepository
    )

  const linked = findLinkedRegistration(organisation, accreditationId)

  if (!linked) {
    logger.warn({
      message: `No registration linked to accreditationId=${accreditationId} — skipping recalculation`
    })
    return
  }

  const { registrationId } = linked

  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    organisationId,
    registrationId
  )

  await wasteBalancesRepository.updateWasteBalanceTransactions(
    wasteRecords,
    accreditationId
  )
}
