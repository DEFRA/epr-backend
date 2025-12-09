import { validateAccreditationId } from './validation.js'

/**
 * Create an in-memory waste balances repository.
 * Ensures data isolation by deep-cloning on read.
 *
 * @param {Array} [initialWasteBalances=[]]
 * @returns {import('./port.js').WasteBalancesRepositoryFactory}
 */
export const createInMemoryWasteBalancesRepository = (
  initialWasteBalances = []
) => {
  // Don't clone wasteBalanceStorage to maintain reference for testing
  const wasteBalanceStorage = initialWasteBalances

  return () => ({
    async findByAccreditationId(accreditationId) {
      const validatedAccreditationId = validateAccreditationId(accreditationId)

      const balance = wasteBalanceStorage.find(
        (b) => b.accreditationId === validatedAccreditationId
      )

      return balance ? structuredClone(balance) : null
    }
  })
}
