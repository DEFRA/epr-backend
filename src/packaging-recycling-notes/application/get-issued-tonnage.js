import { aggregateIssuedTonnage } from '#packaging-recycling-notes/domain/tonnage.js'

/**
 * @typedef {Object} GetIssuedTonnageParams
 * @property {string | null | undefined} accreditationId
 * @property {string} startDate - ISO date string e.g. '2025-01-01'
 * @property {string} endDate - ISO date string e.g. '2025-01-31'
 * @property {import('../domain/model.js').PrnStatus[]} statuses
 */

/**
 * Retrieves all non-deleted PRNs for an accreditation and aggregates their
 * issued tonnage using latest-status-in-period semantics.
 * Returns undefined when accreditationId is absent (non-accredited operator).
 *
 * @param {import('../repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @param {GetIssuedTonnageParams} params
 * @returns {Promise<{ issuedTonnage: number } | undefined>}
 */
export async function getIssuedTonnage(prnRepository, params) {
  const { accreditationId, startDate, endDate, statuses } = params
  if (!accreditationId) {
    return undefined
  }
  const start = new Date(startDate + 'T00:00:00.000Z')
  const end = new Date(endDate + 'T23:59:59.999Z')
  const prns = await prnRepository.findByAccreditation(accreditationId)
  return {
    issuedTonnage: aggregateIssuedTonnage(prns, {
      startDate: start,
      endDate: end,
      statuses
    })
  }
}
