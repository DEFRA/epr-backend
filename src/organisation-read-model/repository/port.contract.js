import { testFindBehaviour } from './contract/find.contract.js'
import { testFindAllBehaviour } from './contract/find-all.contract.js'
import { testFindByOrganisationNumberBehaviour } from './contract/find-by-organisation-number.contract.js'

/** @import { TestAPI } from 'vitest' */
/** @import { AccreditationNumber, OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { OrganisationReadRepository } from './port.js' */

/**
 * An organisation the read model serves, described by what the port reads:
 * its name and its numbers. Each registration is approved and served, as a
 * reprocessor unless its `wasteProcessingType` says exporter, and an
 * accreditation number gives it an accreditation for `SEED_ACCREDITATION_YEAR`,
 * approved from 1 July of that year. Each adapter's tests store it in their
 * own shape.
 *
 * @typedef {{
 *   name: string
 *   organisationNumber: OrganisationNumber
 *   registrations: Array<{
 *     registrationNumber: RegistrationNumber
 *     accreditationNumber?: AccreditationNumber
 *     wasteProcessingType?: 'reprocessor' | 'exporter'
 *     overseasSites?: OverseasSiteSeed[]
 *   }>
 * }} OrganisationSeed
 */

/**
 * An exporter's overseas site, served under `siteNumber` with its name. The
 * exporter's accreditation lists it as approved from `approvedOn`, a calendar
 * date, or as pending without one.
 *
 * @typedef {{
 *   siteNumber: string
 *   name: string
 *   approvedOn?: string
 * }} OverseasSiteSeed
 */

/**
 * Stores the organisations so that the repository it returns serves them.
 *
 * @typedef {(organisations: OrganisationSeed[]) => Promise<OrganisationReadRepository>} OrganisationReadRepositoryServing
 */

/**
 * @typedef {TestAPI<{ organisationReadRepositoryServing: OrganisationReadRepositoryServing }>} OrganisationReadRepositoryContractIt
 */

/**
 * What every organisation read repository does, whatever it reads from.
 * Behaviour of one adapter, such as how the MongoDB adapter maps stored
 * organisations, is tested with that adapter.
 *
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testOrganisationReadRepositoryContract = (it) => {
  describe('organisation read repository contract', () => {
    testFindByOrganisationNumberBehaviour(it)
    testFindBehaviour(it)
    testFindAllBehaviour(it)
  })
}
