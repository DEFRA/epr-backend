/**
 * @import { LedgerEvent, LedgerBalanceSnapshot, LedgerEventKind, LedgerUserSummary, PrnPayload, SummaryLogSubmittedPayload, WasteBalanceLedgerId } from '../repository/ledger-schema.js'
 * @import { WasteBalanceLedgerRepository } from '../repository/ledger-port.js'
 */

/**
 * A balance sits inside an event that already says which balance it is, so each
 * figure names what it counts rather than repeating the word amount.
 *
 * @typedef {Object} LedgerBalance
 * @property {number} total Credits minus debits.
 * @property {number} available The total, minus the tonnage a created note
 *   holds back.
 */

/**
 * Who wrote an event. The ledger holds the best view of an actor it has, so
 * neither the name nor the email is promised: a machine writer carries no
 * email, and an event rebuilt from a record written before a name was captured
 * carries no name.
 *
 * @typedef {Object} LedgerActor
 * @property {string} id
 * @property {string} [name]
 * @property {string} [email]
 */

/**
 * What every event states, whichever thing it concerns.
 *
 * @typedef {Object} LedgerEventCommon
 * @property {number} number The event's position in its ledger, counting from
 *   one.
 * @property {LedgerEventKind} kind
 * @property {Date} createdAt
 * @property {LedgerActor} createdBy
 * @property {{ opening: LedgerBalance, closing: LedgerBalance }} balance The
 *   balance before and after the event.
 */

/**
 * `creditTotal` is the total the summary log itself states, not the amount the
 * balance moved. A submission moves the balance by the difference between its
 * total and the previous submission's.
 *
 * @typedef {LedgerEventCommon & {
 *   summaryLog: { id: string, creditTotal: number },
 *   prn?: never
 * }} SummaryLogEventResource
 */

/**
 * `tonnage` is the tonnage of the note itself, not the amount the balance
 * moved. Accepting or rejecting a note moves neither total.
 *
 * @typedef {LedgerEventCommon & {
 *   prn: { id: string, tonnage: number },
 *   summaryLog?: never
 * }} PrnEventResource
 */

/**
 * An event names the one thing it concerns, so a reader takes the tonnage of a
 * note from `prn` and the credit of a submission from `summaryLog`. An event
 * that names both is a type error.
 *
 * An event that names one and states a `kind` belonging to the other is not.
 * Tying `kind` to the subject here needs a stored event that is itself
 * discriminated on `kind`, and `LedgerEventInsert` pairs the two through the
 * insert schema instead. The response schema tests the pairing at the wire, so
 * a mismatch is refused rather than served.
 *
 * @typedef {SummaryLogEventResource | PrnEventResource} LedgerEventResource
 */

/**
 * @typedef {Object} LedgerResource
 * @property {WasteBalanceLedgerId} ledger
 * @property {LedgerEventResource[]} events
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
 * @param {LedgerUserSummary} actor
 * @returns {LedgerActor}
 */
const toActor = ({ id, name, email }) => ({ id, name, email })

/**
 * A stored event pairs a `kind` with a `payload`, and the insert schema rather
 * than the type holds the two together. The payload's own key tells the two
 * apart: a summary log submission names the log it credits, and every PRN event
 * names the note it concerns.
 *
 * A stored event whose kind and payload disagree never reaches here — the
 * repository validates every read against `ledgerEventReadSchema`, which
 * couples the two, and raises rather than returning it.
 *
 * @param {SummaryLogSubmittedPayload | PrnPayload} payload
 * @returns {payload is SummaryLogSubmittedPayload}
 */
const creditsASummaryLog = (payload) => 'summaryLogId' in payload

/**
 * @param {LedgerEvent} event
 * @returns {LedgerEventResource}
 */
const toEventResource = (event) => {
  const common = {
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
        ...common,
        summaryLog: {
          id: event.payload.summaryLogId,
          creditTotal: event.payload.creditTotal
        }
      }
    : {
        ...common,
        prn: { id: event.payload.prnId, tonnage: event.payload.amount }
      }
}

/**
 * Reads one waste balance ledger.
 *
 * A stored event repeats the organisation, registration and accreditation on
 * every row. Those three are the ledger's identity, not the event's, so they
 * come out once under `ledger`. The registered-only ledger of a registration
 * says so there, as an accreditation of null.
 *
 * Each event is built field by field rather than by narrowing a stored one. A
 * field arrives in a response because someone named it here, and a field added
 * to the ledger reaches nobody until someone does.
 *
 * The whole ledger comes back. A ledger holds one event per submission and per
 * PRN decision, so the count follows the operator's own activity rather than
 * the size of the service. The `events` key leaves room to page it later
 * without changing the shape.
 *
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {WasteBalanceLedgerId} ledgerId - The registration or accreditation
 *   whose ledger is read.
 * @returns {Promise<LedgerResource>}
 */
export const readLedger = async (ledgerRepository, ledgerId) => ({
  ledger: toLedger(ledgerId),
  events: (await ledgerRepository.findAllInLedger(ledgerId)).map(
    toEventResource
  )
})
