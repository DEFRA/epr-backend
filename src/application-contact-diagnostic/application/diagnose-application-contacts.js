import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { RegistrationStatus } from '#domain/organisations/model.js' */

/**
 * @typedef {Object} MissingApplicationContactRow
 * @property {string} organisationId
 * @property {number} orgId
 * @property {boolean} testOrganisation
 * @property {number} schemaVersion
 * @property {string} registrationId
 * @property {string | null} registrationNumber
 * @property {RegistrationStatus} status
 */

/**
 * @typedef {Object} ApplicationContactsSummary
 * @property {number} scannedOrganisations
 * @property {number} scannedRegistrations
 * @property {number} missingApplicationContact
 * @property {number} missingWithRegistrationNumber - would be dropped by the organisation read routes
 */

/**
 * @typedef {Object} ApplicationContactsReport
 * @property {MissingApplicationContactRow[]} rows
 * @property {ApplicationContactsSummary} summary
 */

/**
 * Lists every registration without `applicationContactDetails`.
 *
 * @param {Organisation[]} organisations
 * @returns {ApplicationContactsReport}
 */
export const diagnoseApplicationContacts = (organisations) => {
  const rows = organisations.flatMap((organisation) =>
    organisation.registrations
      .filter(({ applicationContactDetails }) => !applicationContactDetails)
      .map((registration) => ({
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: TEST_ORGANISATION_IDS.has(organisation.orgId),
        schemaVersion: organisation.schemaVersion,
        registrationId: registration.id,
        registrationNumber: registration.registrationNumber ?? null,
        status: registration.status
      }))
  )

  return {
    rows,
    summary: {
      scannedOrganisations: organisations.length,
      scannedRegistrations: organisations.reduce(
        (count, { registrations }) => count + registrations.length,
        0
      ),
      missingApplicationContact: rows.length,
      missingWithRegistrationNumber: rows.filter(
        ({ registrationNumber }) => registrationNumber !== null
      ).length
    }
  }
}
