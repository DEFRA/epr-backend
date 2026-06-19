import { latestCommittedSummaryLogId } from '#waste-balances/application/latest-committed-summary-log-id.js'

/**
 * @typedef {import('#repositories/waste-records/states/schema.js').RowState} RowState
 */

/**
 * Membership query for a resolved committed head: every row whose committed
 * state belongs to that submission, or nothing when there is no head.
 *
 * @param {import('#repositories/waste-records/states/port.js').RowStateRepository} rowStateRepository
 * @param {string | null} head
 * @returns {Promise<RowState[]>}
 */
const rowStatesForHead = async (rowStateRepository, head) =>
  head === null ? [] : rowStateRepository.findBySummaryLogId(head)

/**
 * Waste record states of a registration at its current head submission. The
 * head resolves in one stream lookup; the membership query then returns every
 * row whose committed state belongs to that submission.
 *
 * @param {{
 *   streamRepository: import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository,
 *   rowStateRepository: import('#repositories/waste-records/states/port.js').RowStateRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null
 * }} context
 * @returns {Promise<RowState[]>}
 */
export const wasteRecordStatesForRegistration = async ({
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
