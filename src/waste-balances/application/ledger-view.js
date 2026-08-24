/**
 * @import { LedgerEvent, LedgerBalanceSnapshot, LedgerEventKind, LedgerUserSummary, PrnPayload, SummaryLogSubmittedPayload, WasteBalanceLedgerId } from '../repository/ledger-schema.js'
 * @import { WasteBalanceLedgerRepository } from '../repository/ledger-port.js'
 */

/**
 * A balance sits inside an entry that already says which balance it is, so each
 * figure names what it counts rather than repeating the word amount.
 *
 * @typedef {Object} LedgerBalance
 * @property {number} total Credits minus debits.
 * @property {number} available The total, minus the tonnage a created note
 *   holds back.
 */

/**
 * What every entry records, whichever event it is.
 *
 * @typedef {Object} LedgerEntryBase
 * @property {number} number The entry's position in its ledger, counting from
 *   one.
 * @property {LedgerEventKind} kind
 * @property {Date} createdAt
 * @property {LedgerUserSummary} createdBy
 * @property {{ opening: LedgerBalance, closing: LedgerBalance }} balance The
 *   balance before and after the entry.
 */

/**
 * @typedef {LedgerEntryBase & {
 *   summaryLog: { id: string, creditTotal: number },
 *   prn?: never
 * }} SummaryLogLedgerEntry
 */

/**
 * @typedef {LedgerEntryBase & {
 *   prn: { id: string, tonnage: number },
 *   summaryLog?: never
 * }} PrnLedgerEntry
 */

/**
 * An entry names the one thing it concerns, so a reader takes the tonnage of a
 * note from `prn` and the credit of a submission from `summaryLog`.
 *
 * @typedef {SummaryLogLedgerEntry | PrnLedgerEntry} LedgerEntry
 */

/**
 * @typedef {Object} LedgerResource
 * @property {WasteBalanceLedgerId} ledger
 * @property {LedgerEntry[]} events
 */

/**
 * @typedef {Object} LedgerView
 * @property {(ledgerId: WasteBalanceLedgerId) => Promise<LedgerResource>} read
 */

/**
 * @param {WasteBalanceLedgerId} ledgerId
 * @returns {WasteBalanceLedgerId}
 */
const toLedger = ({ organisationId, registrationId, accreditationId }) => ({
  organisationId,
  registrationId,
  accreditationId
})

/**
 * @param {LedgerBalanceSnapshot} snapshot
 * @returns {LedgerBalance}
 */
const toBalance = ({ amount, availableAmount }) => ({
  total: amount,
  available: availableAmount
})

/**
 * A ledger holds the best view of an actor it has. A machine writer carries no
 * email, and an entry rebuilt from a record written before a name was captured
 * carries no name, so neither is promised.
 *
 * @param {LedgerUserSummary} actor
 * @returns {LedgerUserSummary}
 */
const toActor = ({ id, name, email }) => ({ id, name, email })

/**
 * A stored event pairs a `kind` with a `payload`, and the insert schema rather
 * than the type holds the two together. The payload's own key tells the two
 * apart: a summary log submission names the log it credits, and every PRN event
 * names the note it concerns.
 *
 * @param {SummaryLogSubmittedPayload | PrnPayload} payload
 * @returns {payload is SummaryLogSubmittedPayload}
 */
const creditsASummaryLog = (payload) => 'summaryLogId' in payload

/**
 * @param {LedgerEvent} event
 * @returns {LedgerEntry}
 */
const toEntry = (event) => {
  const entry = {
    number: event.number,
    kind: event.kind,
    createdAt: event.createdAt,
    createdBy: toActor(event.createdBy),
    balance: {
      opening: toBalance(event.openingBalance),
      closing: toBalance(event.closingBalance)
    }
  }

  return creditsASummaryLog(event.payload)
    ? {
        ...entry,
        summaryLog: {
          id: event.payload.summaryLogId,
          creditTotal: event.payload.creditTotal
        }
      }
    : {
        ...entry,
        prn: { id: event.payload.prnId, tonnage: event.payload.amount }
      }
}

/**
 * Reads one waste balance ledger.
 *
 * A stored event repeats the organisation, registration and accreditation on
 * every row. Those three are the ledger's identity, not the entry's, so they
 * come out once under `ledger`. The registered-only ledger of a registration
 * says so there, as an accreditation of null.
 *
 * The view builds each entry field by field rather than narrowing a stored
 * event. A field arrives in a response because someone named it here, and a
 * field added to the ledger reaches nobody until someone does.
 *
 * @param {{ ledgerRepository: WasteBalanceLedgerRepository }} params
 * @returns {LedgerView}
 */
export const createLedgerView = ({ ledgerRepository }) => ({
  read: async (ledgerId) => ({
    ledger: toLedger(ledgerId),
    events: (await ledgerRepository.findAllInLedger(ledgerId)).map(toEntry)
  })
})
