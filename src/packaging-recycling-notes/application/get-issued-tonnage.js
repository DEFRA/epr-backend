import { endOfDay, startOfDay } from '#common/helpers/date-formatter.js'
import { aggregateIssuedTonnage } from '#packaging-recycling-notes/domain/tonnage.js'

/**
 * @typedef {Object} GetIssuedTonnageParams
 * @property {import('#domain/organisations/numbers.js').OrganisationNumber} organisationNumber
 * @property {import('#domain/organisations/numbers.js').RegistrationNumber} registrationNumber
 * @property {import('#domain/organisations/numbers.js').AccreditationNumber | null} accreditationNumber
 * @property {string} startDate - Calendar-date string e.g. '2025-01-01', bare
 *   or a full ISO datetime — startOfDay()/endOfDay() tolerate either shape.
 * @property {string} endDate - Calendar-date string e.g. '2025-01-31', bare
 *   or a full ISO datetime — startOfDay()/endOfDay() tolerate either shape.
 */

/**
 * Retrieves all non-deleted PRNs for an accreditation and aggregates their
 * issued tonnage for the given period.
 * Returns null when there is no accreditation number (non-accredited operator).
 *
 * @param {import('../repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @param {GetIssuedTonnageParams} params
 * @returns {Promise<{ issuedTonnage: number } | null>}
 */
export async function getIssuedTonnage(prnRepository, params) {
  const {
    organisationNumber,
    registrationNumber,
    accreditationNumber,
    startDate,
    endDate
  } = params
  if (!accreditationNumber) {
    return null
  }
  const start = startOfDay(startDate)
  const end = endOfDay(endDate)
  // PRN volumes per accreditation are in the hundreds, so in-memory filtering is negligible.
  // Period filtering stays in the domain layer while the "issued in period" rules are still fluid.
  // Once stable, it could move to the repository with an index on status.issued.at.
  const prns = await prnRepository.findByAccreditation({
    organisationNumber,
    registrationNumber,
    accreditationNumber
  })
  return {
    issuedTonnage: aggregateIssuedTonnage(prns, {
      startDate: start,
      endDate: end
    })
  }
}
