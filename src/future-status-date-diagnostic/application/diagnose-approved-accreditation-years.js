import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

/**
 * @typedef {Object} AccreditationYearsSummary
 * @property {number} scannedApproved
 * @property {number} outsideYear
 */

/**
 * Counts the approved accreditations, and those whose `validFrom` or `validTo`
 * is not in `year`.
 *
 * @param {Organisation[]} organisations
 * @param {number} year
 * @returns {AccreditationYearsSummary}
 */
export const diagnoseApprovedAccreditationYears = (organisations, year) => {
  /** @param {string | undefined} date */
  const isInYear = (date) => date?.startsWith(`${year}-`)

  const approved = organisations.flatMap((organisation) =>
    organisation.accreditations.filter(
      ({ status }) => status === ACCREDITATION_STATUS.APPROVED
    )
  )
  const outsideYear = approved.filter(
    ({ validFrom, validTo }) => !isInYear(validFrom) || !isInYear(validTo)
  )

  return {
    scannedApproved: approved.length,
    outsideYear: outsideYear.length
  }
}
