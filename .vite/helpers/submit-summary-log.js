import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createMockLogger } from '#test/mock-logger.js'
import { toSummaryLogFileId, toSummaryLogId } from '#domain/summary-logs/ids.js'

/**
 * @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js'
 * @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js'
 * @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js'
 * @import { SummaryLogRowStateEntry } from '#waste-records/repository/schema.js'
 */

/**
 * @typedef {{
 *   summaryLogsRepository: SummaryLogsRepository,
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository
 * }} SummaryLogStores
 */

/**
 * @typedef {WasteBalanceLedgerId & {
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null
 * }} SummaryLogLedger
 */

/**
 * @typedef {{
 *   fileId: string,
 *   submittedAt: string,
 *   entries: SummaryLogRowStateEntry[]
 * }} Submission
 */

/** @returns {SummaryLogStores} */
export const emptySummaryLogStores = () => ({
  summaryLogsRepository:
    createInMemorySummaryLogsRepository()(createMockLogger()),
  summaryLogRowStatesRepository: createInMemorySummaryLogRowStatesRepository()()
})

/**
 * Submits a summary log for the ledger's year: its row states on the ledger,
 * and the submitted summary log a report resolves as the head for that year.
 *
 * @param {SummaryLogStores} stores
 * @param {SummaryLogLedger} ledgerId
 * @param {Submission} submission
 */
export const submitSummaryLog = async (
  { summaryLogsRepository, summaryLogRowStatesRepository },
  ledgerId,
  { fileId, submittedAt, entries }
) => {
  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    ledgerId,
    entries,
    toSummaryLogFileId(fileId)
  )
  await summaryLogsRepository.insert(
    toSummaryLogId(`log-${fileId}`),
    summaryLogFactory.submitted({
      ...ledgerId,
      file: { id: toSummaryLogFileId(fileId) },
      submittedAt
    })
  )
}
