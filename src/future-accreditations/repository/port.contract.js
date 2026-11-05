import { describe } from 'vitest'

import { testFindByRegistrationNumbersBehaviour } from './contract/find-by-registration-numbers.contract.js'
import { testRemoveBehaviour } from './contract/remove.contract.js'
import { testUpsertBehaviour } from './contract/upsert.contract.js'

/** @import { TestAPI } from 'vitest' */
/** @import { FutureAccreditationsRepository } from './port.js' */

/**
 * @typedef {TestAPI<{ futureAccreditationsRepository: FutureAccreditationsRepository }>} FutureAccreditationsContractIt
 */

/** @param {FutureAccreditationsContractIt} it */
export const testFutureAccreditationsRepositoryContract = (it) => {
  describe('future accreditations repository contract', () => {
    testUpsertBehaviour(it)
    testFindByRegistrationNumbersBehaviour(it)
    testRemoveBehaviour(it)
  })
}
