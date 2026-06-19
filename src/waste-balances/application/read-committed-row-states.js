import { latestCommittedSummaryLogId } from './latest-committed-summary-log-id.js'

/**
 * @typedef {import('../repository/row-states-schema.js').RowState} RowState
 */

/**
 * Membership query for a resolved committed head: every row whose committed
 * state belongs to that submission, or nothing when there is no head.
 *
 * @param {import('../repository/row-states-port.js').RowStateRepository} rowStateRepository
 * @param {string | null} head
 * @returns {Promise<RowState[]>}
 */
const rowStatesForHead = async (rowStateRepository, head) =>
  head === null ? [] : rowStateRepository.findBySummaryLogId(head)

/**
 * Committed row states of a registration at its current head submission. The
 * head resolves in one stream lookup; the membership query then returns every
 * row whose committed state belongs to that submission.
 *
 * @param {{
 *   streamRepository: import('../repository/stream-port.js').WasteBalanceStreamRepository,
 *   rowStateRepository: import('../repository/row-states-port.js').RowStateRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null
 * }} context
 * @returns {Promise<RowState[]>}
 */
export const committedRowStatesForRegistration = async ({
  streamRepository,
  rowStateRepository,
  registrationId,
  accreditationId
}) => {
  const head = await latestCommittedSummaryLogId(streamRepository, {
    registrationId,
    accreditationId
  })

  return rowStatesForHead(rowStateRepository, head)
}
