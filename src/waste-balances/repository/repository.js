import { validateAccreditationId } from './validation.js'
import { performUpdateWasteBalanceTransactions } from './helpers.js'
import {
  performAppendPrnStreamEvent,
  performDeductAvailableBalanceForPrnCreation,
  performDeductTotalBalanceForPrnIssue,
  performCreditAvailableBalanceForPrnCancellation,
  performCreditFullBalanceForIssuedPrnCancellation
} from './helpers-prn.js'
import { findBalanceByPartition } from './read-balance.js'

/**
 * Creates a waste balances repository. The event-sourced stream is the sole
 * record of every balance, so the repository is a thin facade over the stream:
 * reads resolve amounts from the latest event in a `(registrationId,
 * accreditationId)` partition, and writes append events. The storage backend is
 * whichever stream adapter is injected.
 *
 * @param {Object} dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} dependencies.streamRepository
 * @param {import('#waste-records/repository/port.js').RowStateRepository} [dependencies.rowStateRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [dependencies.featureFlags]
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [dependencies.systemLogsRepository]
 * @returns {import('./port.js').WasteBalancesRepositoryFactory}
 */
export const createWasteBalancesRepository = (dependencies) => {
  const { streamRepository } = dependencies

  const findBalance = (partition) =>
    findBalanceByPartition(streamRepository, partition)

  return () => ({
    findBalance,
    updateWasteBalanceTransactions: async (
      wasteRecords,
      { user, accreditation, overseasSites, summaryLogId }
    ) =>
      performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditation,
        dependencies,
        user,
        overseasSites,
        summaryLogId
      }),
    deductAvailableBalanceForPrnCreation: async (deductParams) =>
      performDeductAvailableBalanceForPrnCreation({
        deductParams,
        findBalance,
        dependencies
      }),
    deductTotalBalanceForPrnIssue: async (deductParams) =>
      performDeductTotalBalanceForPrnIssue({
        deductParams,
        findBalance,
        dependencies
      }),
    creditAvailableBalanceForPrnCancellation: async (creditParams) =>
      performCreditAvailableBalanceForPrnCancellation({
        creditParams,
        findBalance,
        dependencies
      }),
    creditFullBalanceForIssuedPrnCancellation: async (creditParams) =>
      performCreditFullBalanceForIssuedPrnCancellation({
        creditParams,
        findBalance,
        dependencies
      }),
    appendStreamEvent: async (appendParams) =>
      performAppendPrnStreamEvent({
        appendParams,
        findBalance,
        dependencies
      }),
    getPrnCatchupEvents: async ({
      registrationId,
      accreditationId,
      prnId,
      afterEventNumber
    }) => {
      const validatedAccreditationId = validateAccreditationId(accreditationId)
      return streamRepository.findEventsByPrnIdAfter(
        registrationId,
        validatedAccreditationId,
        prnId,
        afterEventNumber
      )
    }
  })
}
