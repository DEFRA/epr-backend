import { latestSubmittedSummaryLogId } from '#waste-balances/application/latest-submitted-summary-log-id.js'

/**
 * @typedef {import('#waste-records/repository/schema.js').SummaryLogRowState} SummaryLogRowState
 */

/**
 * A registration's committed waste-record state projected to its domain
 * content: the row's identity, type, the template it reported under, coerced
 * data and classification. The storage artifacts — the cumulative
 * `summaryLogIds` membership and the storage `id` — and the redundant ledger
 * identity stay behind the seam.
 *
 * `processingType` is content, not an artifact: it is the template the row
 * reported under, so a reader deciding what a row means needs it as much as it
 * needs the row's data.
 *
 * @typedef {Object} WasteRecordState
 * @property {string} rowId
 * @property {import('#domain/waste-records/model.js').WasteRecordType} wasteRecordType
 * @property {import('#domain/summary-logs/meta-fields.js').ProcessingType} processingType
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
export const toWasteRecordState = ({
  rowId,
  wasteRecordType,
  processingType,
  data,
  classification
}) => ({
  rowId,
  wasteRecordType,
  processingType,
  data,
  classification
})

/**
 * The ledger's row states at a resolved head submission, projected to their
 * domain content — or nothing when the ledger has no submitted summary log
 * yet. For a caller that has already resolved the head (and whose read must
 * stay consistent with it), this is the whole read;
 * `summaryLogRowStatesForRegistration` composes it with the head resolution.
 *
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} summaryLogRowStateRepository
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
 * @param {string | null} head
 * @returns {Promise<WasteRecordState[]>}
 */
export const wasteRecordStatesForHead = async (
  summaryLogRowStateRepository,
  ledgerId,
  head
) => {
  if (head === null) {
    return []
  }
  const summaryLogRowStates =
    await summaryLogRowStateRepository.findRowStatesForSummaryLog(
      ledgerId,
      head
    )
  return summaryLogRowStates.map(toWasteRecordState)
}

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

  return wasteRecordStatesForHead(summaryLogRowStateRepository, ledgerId, head)
}
