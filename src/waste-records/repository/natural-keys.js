import { resolveNaturalKey } from '#repositories/organisations/natural-keys.js'

/**
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { LedgerKey, RegistrationKey, SummaryLogRowStatesRepository } from './port.js'
 *
 * @typedef {Pick<SummaryLogRowStatesRepository, 'findWasteRecordStatesForSummaryLog' | 'findRowStatesForSummaryLogFile'>} ReadsById
 * @typedef {Pick<SummaryLogRowStatesRepository, 'findWasteRecordStates' | 'findRowStatesForFile'>} ReadsByNaturalKey
 */

/**
 * The port's natural-key reads, over an adapter's reads by database id.
 *
 * @param {ReadsById} byId
 * @param {OrganisationsRepository} organisationsRepository
 * @returns {ReadsByNaturalKey}
 */
export const readsByNaturalKey = (byId, organisationsRepository) => ({
  /**
   * @param {LedgerKey} key
   * @param {string} summaryLogId
   */
  findWasteRecordStates: async (key, summaryLogId) => {
    const resolved = await resolveNaturalKey(organisationsRepository, key)
    if (!resolved) {
      return []
    }
    const { organisationId, registrationId } = resolved.storedKey
    return byId.findWasteRecordStatesForSummaryLog(
      {
        organisationId,
        registrationId,
        accreditationId: /** @type {string | null} */ (
          resolved.storedKey.accreditationId
        )
      },
      summaryLogId
    )
  },

  /**
   * @param {RegistrationKey} key
   * @param {string} fileId
   */
  findRowStatesForFile: async (
    { organisationNumber, registrationNumber },
    fileId
  ) => {
    const resolved = await resolveNaturalKey(organisationsRepository, {
      organisationNumber,
      registrationNumber
    })
    if (!resolved) {
      return []
    }
    const { organisationId, registrationId } = resolved.storedKey
    const rowStates = await byId.findRowStatesForSummaryLogFile(
      organisationId,
      registrationId,
      fileId
    )
    return rowStates.map(
      ({
        accreditationId,
        rowId,
        wasteRecordType,
        processingType,
        data,
        classification
      }) => ({
        organisationNumber,
        registrationNumber,
        accreditationNumber: resolved.accreditationNumberOf(accreditationId),
        rowId,
        wasteRecordType,
        processingType,
        data,
        classification
      })
    )
  }
})
