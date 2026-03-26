import { aggregateIssuedTonnage } from '#packaging-recycling-notes/domain/tonnage.js'

/**
 * @typedef {Object} GetIssuedTonnageParams
 * @property {string | null | undefined} accreditationId
 * @property {string} startDate - ISO date string e.g. '2025-01-01'
 * @property {string} endDate - ISO date string e.g. '2025-01-31'
 */

/**
 * Retrieves all non-deleted PRNs for an accreditation and aggregates their
 * issued tonnage for the given period.
 * Returns undefined when accreditationId is absent (non-accredited operator).
 *
 * @param {import('../repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @param {GetIssuedTonnageParams} params
 * @returns {Promise<{ issuedTonnage: number } | undefined>}
 */
export async function getIssuedTonnage(prnRepository, params) {
  const { accreditationId, startDate, endDate } = params
  if (!accreditationId) {
    return undefined
  }
  const start = new Date(startDate + 'T00:00:00.000Z')
  const end = new Date(endDate + 'T23:59:59.999Z')
  // PRN volumes per accreditation are in the hundreds, so in-memory filtering is negligible.
  // Period filtering stays in the domain layer while the "issued in period" rules are still fluid.
  // Once stable, it could move to the repository with an index on status.issued.at.
  const prns = await prnRepository.findByAccreditation(accreditationId)
  return {
    issuedTonnage: aggregateIssuedTonnage(prns, {
      startDate: start,
      endDate: end
    })
  }
}
