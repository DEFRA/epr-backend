import { validateAccreditationId } from './validation.js'
import { performUpdateWasteBalanceTransactions } from './helpers.js'
import {
  performAppendPrnStreamEvent,
  performDeductAvailableBalanceForPrnCreation,
  performDeductTotalBalanceForPrnIssue,
  performCreditAvailableBalanceForPrnCancellation,
  performCreditFullBalanceForIssuedPrnCancellation
} from './helpers-prn.js'
import { resolveBalanceAmounts } from './resolve-balance-amounts.js'

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
 * Save a brand new waste balance shell document. Balance movements live in the
 * event-sourced stream, not on this document.
 *
 * @param {import('../domain/model.js').WasteBalance[]} wasteBalanceStorage
 * @returns {(balance: import('../domain/model.js').WasteBalance) => Promise<void>}
 */
export const saveBalance = (wasteBalanceStorage) => async (balance) => {
  wasteBalanceStorage.push(balance)
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

const performGetPrnCatchupEvents =
  (wasteBalanceStorage, streamRepository) =>
  async ({ registrationId, accreditationId, prnId, afterEventNumber }) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)
    const current = wasteBalanceStorage.find(
      (b) => b.accreditationId === validatedAccreditationId
    )
    if (!current) {
      return []
    }
    return streamRepository.findEventsByPrnIdAfter(
      registrationId,
      validatedAccreditationId,
      prnId,
      afterEventNumber
    )
  }

/**
 * The balance-mutating repository methods, sharing one find/save pair over the
 * in-memory storage. Spread into the repository factory's result.
 *
 * @param {import('../domain/model.js').WasteBalance[]} wasteBalanceStorage
 * @param {Object} dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} dependencies.streamRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [dependencies.systemLogsRepository]
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
        dependencies
      }),
    deductTotalBalanceForPrnIssue: async (deductParams) =>
      performDeductTotalBalanceForPrnIssue({
        deductParams,
        findBalance: find,
        dependencies
      }),
    creditAvailableBalanceForPrnCancellation: async (creditParams) =>
      performCreditAvailableBalanceForPrnCancellation({
        creditParams,
        findBalance: find,
        dependencies
      }),
    creditFullBalanceForIssuedPrnCancellation: async (creditParams) =>
      performCreditFullBalanceForIssuedPrnCancellation({
        creditParams,
        findBalance: find,
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
    getPrnCatchupEvents: performGetPrnCatchupEvents(
      wasteBalanceStorage,
      streamRepository
    ),
    _getStorageForTesting: () => wasteBalanceStorage
  })
}
