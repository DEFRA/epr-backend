import { testDroppedRecordsBehaviour } from './contract/dropped-records.contract.js'
import { testFindBehaviour } from './contract/find.contract.js'
import { testFindByOrganisationNumberBehaviour } from './contract/find-by-organisation-number.contract.js'
import { testExternalAccreditationsBehaviour } from './contract/external-accreditations.contract.js'
import { testStatusTimelineBehaviour } from './contract/status-timeline.contract.js'

/** @import { TestAPI } from 'vitest' */
/** @import { ExternalAccreditation } from './to-read-model.js' */
/** @import { OrganisationReadRepository } from './port.js' */

/**
 * Stores the organisations, overseas sites and external accreditations, and
 * returns a repository that reads them.
 *
 * @typedef {(data: {
 *   externalAccreditations?: ExternalAccreditation[]
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
    testExternalAccreditationsBehaviour(it)
  })
}
