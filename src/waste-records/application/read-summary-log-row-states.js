import { latestSubmittedSummaryLog } from '#waste-balances/application/latest-submitted-summary-log.js'

/**
 * @typedef {import('#waste-records/repository/schema.js').SummaryLogRowState} SummaryLogRowState
 */

/**
 * A registration's submitted waste-record state projected to its domain
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
 * A registration's latest submitted summary log together with the row states
 * that belong to it — the baseline a subsequent upload is judged against.
 *
 * @typedef {Object} PreviousSubmission
 * @property {{ summaryLogId: string, submittedAt: Date }} summaryLog
 * @property {WasteRecordState[]} wasteRecordStates
 */

/**
 * @typedef {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * @typedef {WasteBalanceLedgerId & {
 *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
 *   summaryLogRowStateRepository: import('#waste-records/repository/port.js').SummaryLogRowStateRepository
 * }} RegistrationRowStateContext
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
 * The registration's latest submitted summary log and its row states, or null
 * when the registration has never submitted. The summary log resolves from the
 * ledger in one lookup; the membership query then returns every row state
 * belonging to that submission, projected to its domain content.
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
  const summaryLog = await latestSubmittedSummaryLog(ledgerRepository, {
    organisationId,
    registrationId,
    accreditationId
  })

  if (summaryLog === null) {
    return null
  }

  const summaryLogRowStates =
    await summaryLogRowStateRepository.findBySummaryLogId(
      summaryLog.summaryLogId
    )

  return {
    summaryLog,
    wasteRecordStates: summaryLogRowStates.map(toWasteRecordState)
  }
}

/**
 * Waste record states of a registration at its latest submitted summary log,
 * or nothing when it has never submitted.
 *
 * @param {RegistrationRowStateContext} context
 * @returns {Promise<WasteRecordState[]>}
 */
export const summaryLogRowStatesForRegistration = async (context) =>
  (await latestSubmittedSummaryLogRowStates(context))?.wasteRecordStates ?? []
