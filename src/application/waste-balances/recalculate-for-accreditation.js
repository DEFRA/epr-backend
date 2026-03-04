/**
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 * @import {WasteRecordsRepository} from '#repositories/waste-records/port.js'
 * @import {WasteBalancesRepository} from '#repositories/waste-balances/port.js'
 */

/**
 * @typedef {Object} RecalculateParams
 * @property {string} organisationId
 * @property {string} accreditationId
 * @property {OrganisationsRepository} organisationsRepository
 * @property {WasteRecordsRepository} wasteRecordsRepository
 * @property {WasteBalancesRepository} wasteBalancesRepository
 * @property {{ info: Function, warn: Function, error: Function }} logger
 * @property {{ id?: string, email?: string }} [user]
 */

/**
 * Recalculates waste balances for an accreditation by loading all waste
 * records from linked registrations and passing them through the existing
 * delta-based calculator.
 *
 * This function is triggered when an accreditation's status changes and
 * is intentionally agnostic to how the calculator determines target amounts.
 *
 * @param {RecalculateParams} params
 * @returns {Promise<void>}
 */
export const recalculateWasteBalancesForAccreditation = async ({
  organisationId,
  accreditationId,
  organisationsRepository,
  wasteRecordsRepository,
  wasteBalancesRepository,
  logger,
  user
}) => {
  const organisation = await organisationsRepository.findById(organisationId)

  const linkedRegistrations = organisation.registrations.filter(
    (reg) => reg.accreditationId === accreditationId
  )

  if (linkedRegistrations.length === 0) {
    logger.info(
      { accreditationId },
      'No linked registrations found for accreditation — skipping recalculation'
    )
    return
  }

  for (const registration of linkedRegistrations) {
    const wasteRecords = await wasteRecordsRepository.findByRegistration(
      organisationId,
      registration.id
    )

    if (wasteRecords.length === 0) {
      logger.info(
        { accreditationId, registrationId: registration.id },
        'No waste records found for registration — skipping recalculation'
      )
      continue
    }

    logger.info(
      {
        accreditationId,
        registrationId: registration.id,
        trigger: 'status-change',
        wasteRecordCount: wasteRecords.length
      },
      'Recalculating waste balance for accreditation after status change'
    )

    await wasteBalancesRepository.updateWasteBalanceTransactions(
      wasteRecords,
      accreditationId,
      user
    )
  }
}
