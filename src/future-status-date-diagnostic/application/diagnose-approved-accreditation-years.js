import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

/**
 * @typedef {Object} AccreditationOutsideYearRow
 * @property {string} organisationId
 * @property {number} orgId
 * @property {boolean} testOrganisation
 * @property {string} accreditationId
 * @property {string | null} accreditationNumber
 * @property {string | undefined} validFrom
 */

/**
 * @typedef {Object} AccreditationYearsReport
 * @property {AccreditationOutsideYearRow[]} rows
 * @property {{ scannedApproved: number, outsideYear: number }} summary
 */

/**
 * Lists every approved accreditation whose `validFrom` is not in `year`.
 *
 * @param {Organisation[]} organisations
 * @param {number} year
 * @returns {AccreditationYearsReport}
 */
export const diagnoseApprovedAccreditationYears = (organisations, year) => {
  const approved = organisations.flatMap((organisation) =>
    organisation.accreditations
      .filter(({ status }) => status === ACCREDITATION_STATUS.APPROVED)
      .map((accreditation) => ({ organisation, accreditation }))
  )
  const rows = approved
    .filter(
      ({ accreditation }) => !accreditation.validFrom?.startsWith(`${year}-`)
    )
    .map(({ organisation, accreditation }) => ({
      organisationId: organisation.id,
      orgId: organisation.orgId,
      testOrganisation: TEST_ORGANISATION_IDS.has(organisation.orgId),
      accreditationId: accreditation.id,
      accreditationNumber: accreditation.accreditationNumber,
      validFrom: accreditation.validFrom
    }))

  return {
    rows,
    summary: { scannedApproved: approved.length, outsideYear: rows.length }
  }
}
