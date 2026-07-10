import { latestSubmittedSummaryLogId } from '#waste-balances/application/latest-submitted-summary-log-id.js'

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
 * The ledger's row states at a resolved head submission, or nothing when the
 * ledger has no submitted summary log yet.
 *
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} summaryLogRowStateRepository
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
 * @param {string | null} head
 * @returns {Promise<SummaryLogRowState[]>}
 */
const summaryLogRowStatesForHead = async (
  summaryLogRowStateRepository,
  ledgerId,
  head
) =>
  head === null
    ? []
    : summaryLogRowStateRepository.findRowStatesForSummaryLog(ledgerId, head)

/**
 * Waste record states of a registration at its latest submitted summary log.
 * The head resolves in one stream lookup against the ledger; the row states
 * are then read back for that same ledger at that submission, projected to
 * their domain content.
 *
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId & {
 *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
 *   summaryLogRowStateRepository: import('#waste-records/repository/port.js').SummaryLogRowStateRepository
 * }} context
 * @returns {Promise<WasteRecordState[]>}
 */
export const summaryLogRowStatesForRegistration = async ({
  ledgerRepository,
  summaryLogRowStateRepository,
  organisationId,
  registrationId,
  accreditationId
}) => {
  const ledgerId = { organisationId, registrationId, accreditationId }

  const head = await latestSubmittedSummaryLogId(ledgerRepository, ledgerId)

  const summaryLogRowStates = await summaryLogRowStatesForHead(
    summaryLogRowStateRepository,
    ledgerId,
    head
  )
  return summaryLogRowStates.map(toWasteRecordState)
}
