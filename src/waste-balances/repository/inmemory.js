import { validateAccreditationId } from './validation.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'
import {
  performUpdateWasteBalanceTransactions,
  performDeductAvailableBalanceForPrnCreation,
  performDeductTotalBalanceForPrnIssue,
  performCreditAvailableBalanceForPrnCancellation,
  performCreditFullBalanceForIssuedPrnCancellation
} from './helpers.js'
import { resolveBalanceAmounts } from './marker-aware-read.js'

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
    if (existing.migratingSince === undefined) {
      delete preserved.migratingSince
    } else {
      preserved.migratingSince = existing.migratingSince
    }
    wasteBalanceStorage[existingIndex] = preserved
  }

/**
 * Find a waste balance by accreditation ID.
 *
 * @param {import('../domain/model.js').WasteBalance[]} wasteBalanceStorage
 * @param {import('./ledger-port.js').LedgerRepository} ledgerRepository
 * @returns {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>}
 */
export const performFindByAccreditationId =
  (wasteBalanceStorage, ledgerRepository) => async (accreditationId) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)

    const balance = wasteBalanceStorage.find(
      (b) => b.accreditationId === validatedAccreditationId
    )

    if (!balance) {
      return null
    }

    return resolveBalanceAmounts(structuredClone(balance), ledgerRepository)
  }

const performFindByAccreditationIds =
  (wasteBalanceStorage, ledgerRepository) => async (accreditationIds) => {
    const balances = wasteBalanceStorage.filter((b) =>
      accreditationIds.includes(b.accreditationId)
    )

    return Promise.all(
      balances.map((balance) =>
        resolveBalanceAmounts(structuredClone(balance), ledgerRepository)
      )
    )
  }

const performFlipCanonicalSourceToMigrating =
  (wasteBalanceStorage) =>
  async ({ accreditationId, capturedVersion }) => {
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
  }

const performFlipCanonicalSourceToLedger =
  (wasteBalanceStorage) =>
  async ({ accreditationId, capturedVersion }) => {
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
  }

const performResetCanonicalSourceToEmbedded =
  (wasteBalanceStorage) =>
  async ({ accreditationId }) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)
    const current = wasteBalanceStorage.find(
      (b) => b.accreditationId === validatedAccreditationId
    )
    if (!current) {
      return null
    }
    if (current.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING) {
      current.canonicalSource = WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      delete current.migratingSince
    }
    return { canonicalSource: current.canonicalSource }
  }

/**
 * Create an in-memory waste balances repository.
 * Ensures data isolation by deep-cloning on read.
 *
 * @param {Array} initialWasteBalances
 * @param {Object} dependencies
 * @param {import('./ledger-port.js').LedgerRepository} dependencies.ledgerRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [dependencies.featureFlags]
 * @returns {import('./port.js').WasteBalancesRepositoryFactory}
 */
export const createInMemoryWasteBalancesRepository = (
  initialWasteBalances,
  dependencies
) => {
  const wasteBalanceStorage = initialWasteBalances

  const { ledgerRepository } = dependencies

  return () => ({
    findByAccreditationId: performFindByAccreditationId(
      wasteBalanceStorage,
      ledgerRepository
    ),
    findByAccreditationIds: performFindByAccreditationIds(
      wasteBalanceStorage,
      ledgerRepository
    ),
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
        dependencies,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage)
      })
    },
    deductTotalBalanceForPrnIssue: async (deductParams) => {
      return performDeductTotalBalanceForPrnIssue({
        deductParams,
        dependencies,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage)
      })
    },
    creditAvailableBalanceForPrnCancellation: async (creditParams) => {
      return performCreditAvailableBalanceForPrnCancellation({
        creditParams,
        dependencies,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage)
      })
    },
    creditFullBalanceForIssuedPrnCancellation: async (creditParams) => {
      return performCreditFullBalanceForIssuedPrnCancellation({
        creditParams,
        dependencies,
        findBalance: findBalance(wasteBalanceStorage),
        saveBalance: saveBalance(wasteBalanceStorage)
      })
    },
    flipCanonicalSourceToMigrating:
      performFlipCanonicalSourceToMigrating(wasteBalanceStorage),
    flipCanonicalSourceToLedger:
      performFlipCanonicalSourceToLedger(wasteBalanceStorage),
    resetCanonicalSourceToEmbedded:
      performResetCanonicalSourceToEmbedded(wasteBalanceStorage),
    // Test-only method to access internal storage
    _getStorageForTesting: () => wasteBalanceStorage
  })
}
