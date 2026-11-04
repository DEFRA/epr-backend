import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

/**
 * @typedef {import('#organisation-read-model/domain/model.js').Organisation} ReadModelOrganisation
 * @typedef {import('#organisation-read-model/domain/model.js').Registration} ReadModelRegistration
 * @typedef {import('#organisation-read-model/domain/model.js').Registration['accreditations'][string]} ReadModelAccreditation
 * @typedef {import('#domain/organisations/numbers.js').OrganisationNumber} OrganisationNumber
 * @typedef {import('#domain/organisations/numbers.js').RegistrationNumber} RegistrationNumber
 * @typedef {import('#domain/organisations/numbers.js').AccreditationNumber} AccreditationNumber
 */

/**
 * The read-model context attached to an accreditation: the owning
 * organisation, the registration number it is keyed by, the registration, the
 * accreditation, and the accreditation year it is keyed by.
 *
 * @typedef {Object} AccreditationReadModelContext
 * @property {ReadModelOrganisation} organisation
 * @property {RegistrationNumber} registrationNumber
 * @property {ReadModelRegistration} registration
 * @property {ReadModelAccreditation} accreditation
 * @property {string} year
 */

/**
 * @typedef {Object} AccreditationReadModelIndex
 * @property {Map<string, AccreditationReadModelContext>} index
 */

/**
 * The index key for an accreditation: its three numbers joined with '/'.
 *
 * @param {{
 *   organisationNumber: OrganisationNumber
 *   registrationNumber: RegistrationNumber
 *   accreditationNumber: AccreditationNumber
 * }} numbers
 * @returns {string}
 */
export const accreditationKey = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) => `${organisationNumber}/${registrationNumber}/${accreditationNumber}`

/**
 * Index every non-test read-model organisation's accreditations by their
 * natural key (see `accreditationKey`). No status filtering. Test
 * organisations are left out unless `includeTestOrganisations` asks for them.
 *
 * @param {ReadModelOrganisation[]} organisations
 * @param {{ includeTestOrganisations?: boolean }} [options]
 * @returns {AccreditationReadModelIndex}
 */
export const indexReadModelAccreditations = (
  organisations,
  { includeTestOrganisations = false } = {}
) => {
  /** @type {Map<string, AccreditationReadModelContext>} */
  const index = new Map()
  for (const organisation of organisations) {
    const isTestOrganisation = TEST_ORGANISATION_IDS.has(
      Number(organisation.organisationNumber)
    )
    const dropped = isTestOrganisation && !includeTestOrganisations
    for (const [registrationNumber, registration] of Object.entries(
      organisation.registrations
    )) {
      for (const [year, accreditation] of Object.entries(
        registration.accreditations
      )) {
        if (dropped) {
          continue
        }
        index.set(
          accreditationKey({
            organisationNumber: organisation.organisationNumber,
            registrationNumber: /** @type {RegistrationNumber} */ (
              registrationNumber
            ),
            accreditationNumber: accreditation.accreditationNumber
          }),
          {
            organisation,
            registrationNumber: /** @type {RegistrationNumber} */ (
              registrationNumber
            ),
            registration,
            accreditation,
            year
          }
        )
      }
    }
  }
  return { index }
}
