import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

/**
 * @typedef {import('#domain/organisations/model.js').Organisation} Organisation
 */

/**
 * The organisation context attached to an accreditation: the owning
 * organisation, the linked registration (which carries the material and
 * processing type), and the accreditation itself.
 *
 * @typedef {Object} AccreditationContext
 * @property {Organisation} organisation
 * @property {import('#domain/organisations/registration.js').Registration} registration
 * @property {import('#domain/organisations/accreditation.js').Accreditation} accreditation
 */

/**
 * The accreditation index plus the set of accreditation ids belonging to
 * dropped test organisations, so an unmatched ledger entry can be told apart:
 * a test-org accreditation is dropped by design, anything else is an orphan.
 *
 * @typedef {Object} AccreditationIndex
 * @property {Map<string, AccreditationContext>} index
 * @property {Set<string>} testOrgAccreditationIds
 */

/**
 * Index every non-test organisation's accreditations by id, carrying the linked
 * registration and owning organisation. No status filtering: suspended and
 * cancelled accreditations are indexed too — the row-level classification, not
 * the accreditation's current status, decides eligibility. A registered-only
 * registration (no accreditation) contributes nothing to the index. Test
 * organisations' accreditation ids are collected separately rather than indexed,
 * unless `includeTestOrganisations` asks for them to be indexed like any other.
 *
 * @param {Organisation[]} organisations
 * @param {{ includeTestOrganisations?: boolean }} [options]
 * @returns {AccreditationIndex}
 */
export const indexAccreditations = (
  organisations,
  { includeTestOrganisations = false } = {}
) => {
  /** @type {Map<string, AccreditationContext>} */
  const index = new Map()
  /** @type {Set<string>} */
  const testOrgAccreditationIds = new Set()
  for (const organisation of organisations) {
    if (
      !includeTestOrganisations &&
      TEST_ORGANISATION_IDS.has(organisation.orgId)
    ) {
      for (const accreditation of organisation.accreditations) {
        testOrgAccreditationIds.add(accreditation.id)
      }
      continue
    }
    const accreditationById = new Map(
      organisation.accreditations.map((accreditation) => [
        accreditation.id,
        accreditation
      ])
    )
    for (const registration of organisation.registrations) {
      const accreditation = registration.accreditationId
        ? accreditationById.get(registration.accreditationId)
        : undefined
      if (accreditation) {
        index.set(accreditation.id, {
          organisation,
          registration,
          accreditation
        })
      }
    }
  }
  return { index, testOrgAccreditationIds }
}

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
 * @property {Set<AccreditationNumber>} testOrgAccreditationNumbers
 *   accreditation numbers belonging to dropped test organisations
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
 * organisations' accreditation numbers are collected separately rather than
 * indexed, unless `includeTestOrganisations` asks for them to be indexed too.
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
  /** @type {Set<AccreditationNumber>} */
  const testOrgAccreditationNumbers = new Set()
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
          testOrgAccreditationNumbers.add(accreditation.accreditationNumber)
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
  return { index, testOrgAccreditationNumbers }
}
