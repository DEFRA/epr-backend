import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'

/** @import { AccreditationStatus, Organisation, RegistrationStatus } from '#domain/organisations/model.js' */

/**
 * @typedef {Object} RegulatorMismatchRow
 * @property {string} organisationId
 * @property {number} orgId
 * @property {boolean} testOrganisation
 * @property {string} registrationId
 * @property {string | null} registrationNumber
 * @property {RegistrationStatus} registrationStatus
 * @property {string} registrationRegulator
 * @property {string} accreditationId
 * @property {string | null} accreditationNumber
 * @property {AccreditationStatus} accreditationStatus
 * @property {string} accreditationRegulator
 */

/**
 * @typedef {Object} RegulatorMismatchSummary
 * @property {number} scannedOrganisations
 * @property {number} linkedPairs
 * @property {number} mismatchedPairs
 * @property {number} mismatchedInTestOrganisations
 */

/**
 * @typedef {Object} RegulatorMismatchReport
 * @property {RegulatorMismatchRow[]} rows
 * @property {RegulatorMismatchSummary} summary
 */

/**
 * Lists every linked registration and accreditation whose
 * `submittedToRegulator` differs, whatever their number or status.
 *
 * @param {Organisation[]} organisations
 * @returns {RegulatorMismatchReport}
 */
export const diagnoseRegulatorMismatch = (organisations) => {
  const pairs = organisations.flatMap((organisation) =>
    organisation.registrations.flatMap((registration) =>
      accreditationsForRegistration(registration, organisation).map(
        (accreditation) => ({ organisation, registration, accreditation })
      )
    )
  )

  const rows = pairs
    .filter(
      ({ registration, accreditation }) =>
        registration.submittedToRegulator !== accreditation.submittedToRegulator
    )
    .map(({ organisation, registration, accreditation }) => ({
      organisationId: organisation.id,
      orgId: organisation.orgId,
      testOrganisation: TEST_ORGANISATION_IDS.has(organisation.orgId),
      registrationId: registration.id,
      registrationNumber: registration.registrationNumber ?? null,
      registrationStatus: registration.status,
      registrationRegulator: registration.submittedToRegulator,
      accreditationId: accreditation.id,
      accreditationNumber: accreditation.accreditationNumber ?? null,
      accreditationStatus: accreditation.status,
      accreditationRegulator: accreditation.submittedToRegulator
    }))

  return {
    rows,
    summary: {
      scannedOrganisations: organisations.length,
      linkedPairs: pairs.length,
      mismatchedPairs: rows.length,
      mismatchedInTestOrganisations: rows.filter((row) => row.testOrganisation)
        .length
    }
  }
}
