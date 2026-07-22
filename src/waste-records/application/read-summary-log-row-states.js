import { latestSubmittedSummaryLog } from '#waste-balances/application/latest-submitted-summary-log.js'

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
 * A registration's latest submitted summary log together with the row states
 * that belong to it — the baseline a subsequent upload is judged against.
 *
 * @typedef {Object} PreviousSubmission
 * @property {{ summaryLogId: string, submittedAt: Date }} summaryLog
 * @property {WasteRecordState[]} wasteRecordStates
 */

/**
 * @typedef {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId & {
 *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
 *   summaryLogRowStateRepository: import('#waste-records/repository/port.js').SummaryLogRowStateRepository
 * }} RegistrationRowStateContext
 */

/**
 * The registration's latest submitted summary log and its row states, or null
 * when the registration has never submitted. The summary log resolves from the
 * ledger in one stream lookup; the row states are then read back for that same
 * ledger at that submission, projected to their domain content.
 *
 * @param {RegistrationRowStateContext} context
 * @returns {Promise<PreviousSubmission | null>}
 */
export const latestSubmittedSummaryLogRowStates = async ({
  ledgerRepository,
  summaryLogRowStateRepository,
  organisationId,
  registrationId,
  accreditationId
}) => {
  const ledgerId = { organisationId, registrationId, accreditationId }

  const summaryLog = await latestSubmittedSummaryLog(ledgerRepository, ledgerId)

  if (summaryLog === null) {
    return null
  }

  const wasteRecordStates = await wasteRecordStatesForHead(
    summaryLogRowStateRepository,
    ledgerId,
    summaryLog.summaryLogId
  )

  return { summaryLog, wasteRecordStates }
}

/**
 * Waste record states of a registration at its latest submitted summary log,
 * or an empty array when it has never submitted.
 *
 * @param {RegistrationRowStateContext} context
 * @returns {Promise<WasteRecordState[]>}
 */
export const summaryLogRowStatesForRegistration = async (context) =>
  (await latestSubmittedSummaryLogRowStates(context))?.wasteRecordStates ?? []
