/** @import {WasteRecordsRepository} from '#repositories/waste-records/port.js' */
/** @import {WasteBalancesRepository} from '#repositories/waste-balances/port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * @typedef {{
 *   organisationsRepository: OrganisationsRepository
 *   wasteRecordsRepository: WasteRecordsRepository
 *   wasteBalancesRepository: WasteBalancesRepository
 * }} RecalculationDependencies
 */

/**
 * Finds the registration linked to the given accreditation within the
 * organisation, then loads the associated waste records and delegates
 * to the existing waste balance update pipeline.
 *
 * Early returns if no linked registration is found or if there are
 * no waste records for the registration.
 *
 * @param {Object} params
 * @param {string} params.organisationId - The organisation containing the accreditation
 * @param {string} params.accreditationId - The accreditation whose balance should be recalculated
 * @param {RecalculationDependencies} params.dependencies - Repository dependencies
 * @returns {Promise<void>}
 */
export const recalculateWasteBalancesForAccreditation = async ({
  organisationId,
  accreditationId,
  dependencies
}) => {
  const {
    organisationsRepository,
    wasteRecordsRepository,
    wasteBalancesRepository
  } = dependencies

  const organisation = await organisationsRepository.findById(organisationId)

  const linkedRegistration = organisation?.registrations?.find(
    (r) => r.accreditationId === accreditationId
  )

  if (!linkedRegistration) {
    return
  }

  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    organisationId,
    linkedRegistration.id
  )

  if (wasteRecords.length === 0) {
    return
  }

  await wasteBalancesRepository.updateWasteBalanceTransactions(
    wasteRecords,
    accreditationId
  )
}
