import { latestCommittedSummaryLogId } from '#waste-balances/application/latest-committed-summary-log-id.js'

/**
 * @typedef {import('#repositories/waste-records/states/schema.js').RowState} RowState
 */

/**
 * A registration's committed waste-record state projected to its domain
 * content: the row's identity, type, coerced data and classification. The
 * storage artifacts — the cumulative `summaryLogIds` membership and the
 * storage `id` — and the redundant partition stay behind the seam.
 *
 * @typedef {Object} WasteRecordState
 * @property {string} rowId
 * @property {import('#domain/waste-records/model.js').WasteRecordType} wasteRecordType
 * @property {Record<string, any>} data
 * @property {import('#repositories/waste-records/states/schema.js').RowClassification} classification
 */

/**
 * Project a stored row state onto its domain content — the storage↔domain
 * seam where membership, storage id and partition are dropped.
 *
 * @param {RowState} rowState
 * @returns {WasteRecordState}
 */
const toWasteRecordState = ({
  rowId,
  wasteRecordType,
  data,
  classification
}) => ({
  rowId,
  wasteRecordType,
  data,
  classification
})

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
 * row whose committed state belongs to that submission, projected to its
 * domain content.
 *
 * @param {{
 *   streamRepository: import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository,
 *   rowStateRepository: import('#repositories/waste-records/states/port.js').RowStateRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null
 * }} context
 * @returns {Promise<WasteRecordState[]>}
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

  const rowStates = await rowStatesForHead(rowStateRepository, head)
  return rowStates.map(toWasteRecordState)
}
