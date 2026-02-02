import { validateAccreditationId } from './validation.js'
import { performUpdateWasteBalanceTransactions } from './helpers.js'

/**
 * Find a waste balance by accreditation ID.
 *
 * @param {import('#domain/waste-balances/model.js').WasteBalance[]} wasteBalanceStorage
 * @returns {(id: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>}
 */
export const findBalance = (wasteBalanceStorage) => async (id) => {
  const balance = wasteBalanceStorage.find((b) => b.accreditationId === id)
  return balance ? structuredClone(balance) : null
}

/**
 * Save a waste balance.
 *
 * @param {import('#domain/waste-balances/model.js').WasteBalance[]} wasteBalanceStorage
 * @returns {(updatedBalance: import('#domain/waste-balances/model.js').WasteBalance, newTransactions: any[]) => Promise<void>}
 */
export const saveBalance = (wasteBalanceStorage) => async (
  updatedBalance,
  _newTransactions
) => {
  const existingIndex = wasteBalanceStorage.findIndex(
    (b) => b.accreditationId === updatedBalance.accreditationId
  )

  if (existingIndex === -1) {
    wasteBalanceStorage.push(updatedBalance)
  } else {
    wasteBalanceStorage[existingIndex] = updatedBalance
  }
}

/**
 * Find a waste balance by accreditation ID.
 *
 * @param {import('#domain/waste-balances/model.js').WasteBalance[]} wasteBalanceStorage
 * @returns {(accreditationId: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>}
 */
export const performFindByAccreditationId =
  (wasteBalanceStorage) => async (accreditationId) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)

    const balance = wasteBalanceStorage.find(
      (b) => b.accreditationId === validatedAccreditationId
    )

    return balance ? structuredClone(balance) : null
  }

const performFindByAccreditationIds =
  (wasteBalanceStorage) => async (accreditationIds) => {
    const balances = wasteBalanceStorage.filter((b) =>
      accreditationIds.includes(b.accreditationId)
    )

    return balances.map((balance) => structuredClone(balance))
  }

/**
 * Create an in-memory waste balances repository.
 * Ensures data isolation by deep-cloning on read.
 *
 * @param {Array} [initialWasteBalances=[]]
 * @param {Object} [dependencies]
 * @returns {import('./port.js').WasteBalancesRepositoryFactory}
 */
export const createInMemoryWasteBalancesRepository = (
  initialWasteBalances = [],
  dependencies = {}
) => {
  const wasteBalanceStorage = initialWasteBalances

  return () => ({
    findByAccreditationId: performFindByAccreditationId(wasteBalanceStorage),
    findByAccreditationIds: performFindByAccreditationIds(wasteBalanceStorage),
    updateWasteBalanceTransactions: async (
      wasteRecords,
      accreditationId,
      user
    ) => {
      return performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId,
        dependencies,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage),
        user
      })
    },
    // Test-only method to access internal storage
    _getStorageForTesting: () => wasteBalanceStorage
  })
}
