import { testDroppedRecordsBehaviour } from './contract/dropped-records.contract.js'
import { testFindBehaviour } from './contract/find.contract.js'
import { testFindByOrganisationNumberBehaviour } from './contract/find-by-organisation-number.contract.js'
import { testFutureAccreditationsBehaviour } from './contract/future-accreditations.contract.js'
import { testStatusTimelineBehaviour } from './contract/status-timeline.contract.js'

/** @import { TestAPI } from 'vitest' */
/** @import { FutureAccreditation } from '#future-accreditations/repository/port.js' */
/** @import { OrganisationReadRepository } from './port.js' */

/**
 * Stores the organisations, overseas sites and future accreditations, and
 * returns a repository that reads them.
 *
 * @typedef {(data: {
 *   futureAccreditations?: FutureAccreditation[]
 *   logger?: { warn: (...args: any[]) => void }
 *   organisations: object[]
 *   overseasSites?: object[]
 * }) => Promise<OrganisationReadRepository>} OrganisationReadRepositoryWith
 */

/**
 * @typedef {TestAPI<{ organisationReadRepositoryWith: OrganisationReadRepositoryWith }>} OrganisationReadRepositoryContractIt
 */

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testOrganisationReadRepositoryContract = (it) => {
  describe('organisation read repository contract', () => {
    testFindByOrganisationNumberBehaviour(it)
    testFindBehaviour(it)
    testStatusTimelineBehaviour(it)
    testDroppedRecordsBehaviour(it)
    testFutureAccreditationsBehaviour(it)
  })
}
