import { testDroppedRecordsBehaviour } from './contract/dropped-records.contract.js'
import { testFindAllBehaviour } from './contract/find-all.contract.js'
import { testFindByOrganisationNumberBehaviour } from './contract/find-by-organisation-number.contract.js'
import { testFindBehaviour } from './contract/find.contract.js'
import { testStatusTimelineBehaviour } from './contract/status-timeline.contract.js'

/** @import { TestAPI } from 'vitest' */
/** @import { OrganisationReadRepository } from './port.js' */

/**
 * Stores the organisations and overseas sites, and returns a repository that
 * reads them.
 *
 * @typedef {(data: {
 *   organisations: object[]
 *   overseasSites?: object[]
 *   logger?: { warn: (...args: any[]) => void }
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
    testFindAllBehaviour(it)
    testStatusTimelineBehaviour(it)
    testDroppedRecordsBehaviour(it)
  })
}
