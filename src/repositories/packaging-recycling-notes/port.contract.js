import { describe } from 'vitest'
import { testFindBehaviour } from './contract/find.contract.js'

/**
 * Runs all contract tests against a PRN repository implementation.
 * Used to verify that both MongoDB and in-memory implementations
 * behave consistently.
 *
 * @param {Function} it - Test function with packagingRecyclingNotesRepository fixture
 */
export const testPackagingRecyclingNotesRepositoryContract = (it) => {
  describe('packaging recycling notes repository contract', () => {
    testFindBehaviour(it)
  })
}
