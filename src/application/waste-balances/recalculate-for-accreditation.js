/**
 * Recalculates waste balance for a single accreditation by loading all
 * waste records for the linked registration and feeding them through the
 * existing balance update pipeline.
 *
 * This function is intentionally agnostic to how the calculator works.
 * It simply loads records and delegates to the repository method.
 *
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.accreditationId
 * @param {string} params.registrationId
 * @param {object} params.wasteRecordsRepository
 * @param {object} params.wasteBalancesRepository
 * @param {object} params.logger
 * @returns {Promise<void>}
 */
export const recalculateWasteBalancesForAccreditation = async ({
  organisationId,
  accreditationId,
  registrationId,
  wasteRecordsRepository,
  wasteBalancesRepository,
  logger
}) => {
  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    organisationId,
    registrationId
  )

  if (wasteRecords.length === 0) {
    logger.info({
      message: `No waste records found for recalculation: organisationId=${organisationId} registrationId=${registrationId} accreditationId=${accreditationId}`
    })
    return
  }

  logger.info({
    message: `Recalculating waste balance: accreditationId=${accreditationId} with ${wasteRecords.length} waste records`
  })

  await wasteBalancesRepository.updateWasteBalanceTransactions(
    wasteRecords,
    accreditationId
  )

  logger.info({
    message: `Waste balance recalculation complete: accreditationId=${accreditationId}`
  })
}
