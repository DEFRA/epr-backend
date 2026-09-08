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

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

/**
 * Index every non-test organisation's accreditations by id, carrying the linked
 * registration and owning organisation. No status filtering: suspended and
 * cancelled accreditations are indexed too — the row-level classification, not
 * the accreditation's current status, decides eligibility. A registered-only
 * registration (no accreditation) contributes nothing to the index. Test
 * organisations' accreditation ids are collected separately rather than indexed.
 *
 * @param {Organisation[]} organisations
 * @returns {AccreditationIndex}
 */
export const indexAccreditations = (organisations) => {
  /** @type {Map<string, AccreditationContext>} */
  const index = new Map()
  /** @type {Set<string>} */
  const testOrgAccreditationIds = new Set()
  for (const organisation of organisations) {
    if (TEST_ORGANISATIONS.has(organisation.orgId)) {
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
