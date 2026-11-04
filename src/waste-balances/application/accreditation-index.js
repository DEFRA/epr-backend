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
 * Every accreditation of one organisation, with the registration number and
 * accreditation year each is keyed by.
 *
 * @param {ReadModelOrganisation} organisation
 * @returns {AccreditationReadModelContext[]}
 */
const accreditationContexts = (organisation) =>
  Object.entries(organisation.registrations).flatMap(
    ([registrationNumber, registration]) =>
      Object.entries(registration.accreditations).map(
        ([year, accreditation]) => ({
          organisation,
          registrationNumber: /** @type {RegistrationNumber} */ (
            registrationNumber
          ),
          registration,
          accreditation,
          year
        })
      )
  )

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
    const contexts = accreditationContexts(organisation)
    if (isTestOrganisation && !includeTestOrganisations) {
      for (const { accreditation } of contexts) {
        testOrgAccreditationNumbers.add(accreditation.accreditationNumber)
      }
      continue
    }
    for (const context of contexts) {
      index.set(
        accreditationKey({
          organisationNumber: organisation.organisationNumber,
          registrationNumber: context.registrationNumber,
          accreditationNumber: context.accreditation.accreditationNumber
        }),
        context
      )
    }
  }
  return { index, testOrgAccreditationNumbers }
}
