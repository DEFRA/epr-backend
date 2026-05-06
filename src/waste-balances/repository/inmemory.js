import { validateAccreditationId } from './validation.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'
import {
  performUpdateWasteBalanceTransactions,
  performDeductAvailableBalanceForPrnCreation,
  performDeductTotalBalanceForPrnIssue,
  performCreditAvailableBalanceForPrnCancellation,
  performCreditFullBalanceForIssuedPrnCancellation
} from './helpers.js'

/**
 * Find a waste balance by accreditation ID.
 *
 * @param {import('../domain/model.js').WasteBalance[]} wasteBalanceStorage
 * @returns {(id: string) => Promise<import('../domain/model.js').WasteBalance | null>}
 */
export const findBalance = (wasteBalanceStorage) => async (id) => {
  const balance = wasteBalanceStorage.find((b) => b.accreditationId === id)
  return balance ? structuredClone(balance) : null
}

/**
 * Save a waste balance.
 *
 * On update, both `canonicalSource` and `migratingSince` are taken from the
 * existing document, ignoring whatever the caller supplies. The marker
 * lifecycle is mutated solely by `flipCanonicalSourceToMigrating`,
 * `flipCanonicalSourceToLedger`, and `resetCanonicalSourceToEmbedded`; every
 * other write path is marker-blind. Inserts take the caller's
 * `canonicalSource` verbatim so the initial marker (`'embedded'` for fresh
 * balances) lands on the new doc.
 *
 * @param {import('../domain/model.js').WasteBalance[]} wasteBalanceStorage
 * @returns {(updatedBalance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>}
 */
export const saveBalance =
  (wasteBalanceStorage) => async (updatedBalance, _newTransactions) => {
    const existingIndex = wasteBalanceStorage.findIndex(
      (b) => b.accreditationId === updatedBalance.accreditationId
    )

    if (existingIndex === -1) {
      wasteBalanceStorage.push(updatedBalance)
      return
    }

    const existing = wasteBalanceStorage[existingIndex]
    const preserved = {
      ...updatedBalance,
      canonicalSource: existing.canonicalSource
    }
    if (existing.migratingSince !== undefined) {
      preserved.migratingSince = existing.migratingSince
    } else {
      delete preserved.migratingSince
    }
    wasteBalanceStorage[existingIndex] = preserved
  }

/**
 * Find a waste balance by accreditation ID.
 *
 * @param {import('../domain/model.js').WasteBalance[]} wasteBalanceStorage
 * @returns {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>}
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
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [dependencies.systemLogsRepository]
 * @param {import('./ledger-port.js').LedgerRepository} [dependencies.ledgerRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [dependencies.featureFlags]
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
      { user, accreditation, overseasSites }
    ) => {
      return performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditation,
        dependencies,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage),
        user,
        overseasSites
      })
    },
    deductAvailableBalanceForPrnCreation: async (deductParams) => {
      return performDeductAvailableBalanceForPrnCreation({
        deductParams,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage)
      })
    },
    deductTotalBalanceForPrnIssue: async (deductParams) => {
      return performDeductTotalBalanceForPrnIssue({
        deductParams,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage)
      })
    },
    creditAvailableBalanceForPrnCancellation: async (creditParams) => {
      return performCreditAvailableBalanceForPrnCancellation({
        creditParams,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage)
      })
    },
    creditFullBalanceForIssuedPrnCancellation: async (creditParams) => {
      return performCreditFullBalanceForIssuedPrnCancellation({
        creditParams,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage)
      })
    },
    flipCanonicalSourceToMigrating: async ({
      accreditationId,
      capturedVersion
    }) => {
      const validatedAccreditationId = validateAccreditationId(accreditationId)
      const current = wasteBalanceStorage.find(
        (b) => b.accreditationId === validatedAccreditationId
      )
      if (!current) {
        return null
      }
      if (
        current.version === capturedVersion &&
        current.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      ) {
        current.canonicalSource = WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
        current.migratingSince = new Date().toISOString()
      }
      return { canonicalSource: current.canonicalSource }
    },
    flipCanonicalSourceToLedger: async ({
      accreditationId,
      capturedVersion
    }) => {
      const validatedAccreditationId = validateAccreditationId(accreditationId)
      const current = wasteBalanceStorage.find(
        (b) => b.accreditationId === validatedAccreditationId
      )
      if (!current) {
        return null
      }
      if (
        current.version === capturedVersion &&
        current.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      ) {
        current.canonicalSource = WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
        delete current.migratingSince
      }
      return { canonicalSource: current.canonicalSource }
    },
    resetCanonicalSourceToEmbedded: async ({ accreditationId }) => {
      const validatedAccreditationId = validateAccreditationId(accreditationId)
      const current = wasteBalanceStorage.find(
        (b) => b.accreditationId === validatedAccreditationId
      )
      if (!current) {
        return null
      }
      if (
        current.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      ) {
        current.canonicalSource = WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
        delete current.migratingSince
      }
      return { canonicalSource: current.canonicalSource }
    },
    // Test-only method to access internal storage
    _getStorageForTesting: () => wasteBalanceStorage
  })
}
