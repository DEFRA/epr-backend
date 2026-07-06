import { latestCommittedSummaryLogId } from '#waste-balances/application/latest-committed-summary-log-id.js'

/**
 * @typedef {import('#waste-records/repository/schema.js').SummaryLogRowState} SummaryLogRowState
 */

/**
 * A registration's committed waste-record state projected to its domain
 * content: the row's identity, type, coerced data and classification. The
 * storage artifacts — the cumulative `summaryLogIds` membership and the
 * storage `id` — and the redundant ledger identity stay behind the seam.
 *
 * @typedef {Object} WasteRecordState
 * @property {string} rowId
 * @property {import('#domain/waste-records/model.js').WasteRecordType} wasteRecordType
 * @property {Record<string, any>} data
 * @property {import('#waste-records/repository/schema.js').RowClassification} classification
 */

/**
 * Project a stored row state onto its domain content — the storage↔domain
 * seam where membership, storage id and ledger identity are dropped.
 *
 * @param {SummaryLogRowState} summaryLogRowState
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
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} summaryLogRowStateRepository
 * @param {string | null} head
 * @returns {Promise<SummaryLogRowState[]>}
 */
const summaryLogRowStatesForHead = async (
  summaryLogRowStateRepository,
  head
) =>
  head === null ? [] : summaryLogRowStateRepository.findBySummaryLogId(head)

/**
 * Waste record states of a registration at its current head submission. The
 * head resolves in one stream lookup; the membership query then returns every
 * row whose committed state belongs to that submission, projected to its
 * domain content.
 *
 * @param {{
 *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
 *   summaryLogRowStateRepository: import('#waste-records/repository/port.js').SummaryLogRowStateRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null
 * }} context
 * @returns {Promise<WasteRecordState[]>}
 */
export const summaryLogRowStatesForRegistration = async ({
  ledgerRepository,
  summaryLogRowStateRepository,
  registrationId,
  accreditationId
}) => {
  const head = await latestCommittedSummaryLogId(ledgerRepository, {
    registrationId,
    accreditationId
  })

  const summaryLogRowStates = await summaryLogRowStatesForHead(
    summaryLogRowStateRepository,
    head
  )
  return summaryLogRowStates.map(toWasteRecordState)
}
