import { validateAccreditationId } from './validation.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'
import { performUpdateWasteBalanceTransactions } from './helpers.js'
import {
  performAppendPrnStreamEvent,
  performDeductAvailableBalanceForPrnCreation,
  performDeductTotalBalanceForPrnIssue,
  performCreditAvailableBalanceForPrnCancellation,
  performCreditFullBalanceForIssuedPrnCancellation
} from './helpers-prn.js'
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
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @returns {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>}
 */
export const performFindByAccreditationId =
  (wasteBalanceStorage, streamRepository) => async (accreditationId) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)

    const balance = wasteBalanceStorage.find(
      (b) => b.accreditationId === validatedAccreditationId
    )

    if (!balance) {
      return null
    }

    return resolveBalanceAmounts(structuredClone(balance), streamRepository)
  }

const performFindByAccreditationIds =
  (wasteBalanceStorage, streamRepository) => async (accreditationIds) => {
    const balances = wasteBalanceStorage.filter((b) =>
      accreditationIds.includes(b.accreditationId)
    )

    return Promise.all(
      balances.map((balance) =>
        resolveBalanceAmounts(structuredClone(balance), streamRepository)
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
  async ({ accreditationId, registrationId, capturedVersion }) => {
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
      current.registrationId = registrationId
    }
    return { canonicalSource: current.canonicalSource }
  }

const performGetPrnCatchupEvents =
  (wasteBalanceStorage, streamRepository) =>
  async ({ registrationId, accreditationId, prnId, afterEventNumber }) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)
    const current = wasteBalanceStorage.find(
      (b) => b.accreditationId === validatedAccreditationId
    )
    if (current?.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.LEDGER) {
      return []
    }
    return streamRepository.findEventsByPrnIdAfter(
      registrationId,
      validatedAccreditationId,
      prnId,
      afterEventNumber
    )
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
 * The balance-mutating repository methods, sharing one find/save pair over the
 * in-memory storage. Spread into the repository factory's result.
 *
 * @param {import('../domain/model.js').WasteBalance[]} wasteBalanceStorage
 * @param {Object} dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} dependencies.streamRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [dependencies.featureFlags]
 */
const balanceMutators = (wasteBalanceStorage, dependencies) => {
  const find = findBalance(wasteBalanceStorage)
  const save = saveBalance(wasteBalanceStorage)
  return {
    updateWasteBalanceTransactions: async (
      wasteRecords,
      { user, accreditation, overseasSites, summaryLogId }
    ) =>
      performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditation,
        dependencies,
        findBalance: find,
        saveBalance: save,
        user,
        overseasSites,
        summaryLogId
      }),
    deductAvailableBalanceForPrnCreation: async (deductParams) =>
      performDeductAvailableBalanceForPrnCreation({
        deductParams,
        findBalance: find,
        saveBalance: save,
        dependencies
      }),
    deductTotalBalanceForPrnIssue: async (deductParams) =>
      performDeductTotalBalanceForPrnIssue({
        deductParams,
        findBalance: find,
        saveBalance: save,
        dependencies
      }),
    creditAvailableBalanceForPrnCancellation: async (creditParams) =>
      performCreditAvailableBalanceForPrnCancellation({
        creditParams,
        findBalance: find,
        saveBalance: save,
        dependencies
      }),
    creditFullBalanceForIssuedPrnCancellation: async (creditParams) =>
      performCreditFullBalanceForIssuedPrnCancellation({
        creditParams,
        findBalance: find,
        saveBalance: save,
        dependencies
      }),
    appendStreamEvent: async (appendParams) =>
      performAppendPrnStreamEvent({
        appendParams,
        findBalance: find,
        dependencies
      })
  }
}

/**
 * Create an in-memory waste balances repository.
 * Ensures data isolation by deep-cloning on read.
 *
 * @param {Array} initialWasteBalances
 * @param {Object} dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} dependencies.streamRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [dependencies.featureFlags]
 * @returns {import('./port.js').WasteBalancesRepositoryFactory}
 */
export const createInMemoryWasteBalancesRepository = (
  initialWasteBalances,
  dependencies
) => {
  const wasteBalanceStorage = initialWasteBalances
  const { streamRepository } = dependencies

  return () => ({
    findByAccreditationId: performFindByAccreditationId(
      wasteBalanceStorage,
      streamRepository
    ),
    findByAccreditationIds: performFindByAccreditationIds(
      wasteBalanceStorage,
      streamRepository
    ),
    ...balanceMutators(wasteBalanceStorage, dependencies),
    flipCanonicalSourceToMigrating:
      performFlipCanonicalSourceToMigrating(wasteBalanceStorage),
    flipCanonicalSourceToLedger:
      performFlipCanonicalSourceToLedger(wasteBalanceStorage),
    resetCanonicalSourceToEmbedded:
      performResetCanonicalSourceToEmbedded(wasteBalanceStorage),
    getPrnCatchupEvents: performGetPrnCatchupEvents(
      wasteBalanceStorage,
      streamRepository
    ),
    _getStorageForTesting: () => wasteBalanceStorage
  })
}
