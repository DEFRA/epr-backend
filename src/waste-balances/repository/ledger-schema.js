import Joi from 'joi'

export const LEDGER_EVENT_KIND = Object.freeze({
  SUMMARY_LOG_SUBMITTED: 'summary-log-submitted',
  PRN_CREATED: 'prn-created',
  PRN_ISSUED: 'prn-issued',
  PRN_CREATION_CANCELLED: 'prn-creation-cancelled',
  PRN_CANCELLED_AFTER_ISSUE: 'prn-cancelled-after-issue',
  PRN_ACCEPTED: 'prn-accepted',
  PRN_REJECTED: 'prn-rejected'
})

/**
 * @typedef {typeof LEDGER_EVENT_KIND[keyof typeof LEDGER_EVENT_KIND]} LedgerEventKind
 */

const kindValues = Object.values(LEDGER_EVENT_KIND)

/**
 * The balance pool a PRN raise draws on (ADR-0049). `general` is the single
 * balance every PRN drew before December waste existed; `december` is the
 * ringfenced portion an accruing accreditation's December declaration draws.
 * The year is not named because it is implicit: a December PRN is only
 * raisable within its accreditation year's declaration window. Modelled as a
 * value rather than a boolean flag so a future third pool is a one-line
 * addition here rather than a second flag to reconcile.
 */
export const POOL = Object.freeze({
  GENERAL: 'general',
  DECEMBER: 'december'
})

/**
 * @typedef {typeof POOL[keyof typeof POOL]} Pool
 */

const poolValues = Object.values(POOL)

const PRN_KINDS = new Set([
  LEDGER_EVENT_KIND.PRN_CREATED,
  LEDGER_EVENT_KIND.PRN_ISSUED,
  LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED,
  LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
  LEDGER_EVENT_KIND.PRN_ACCEPTED,
  LEDGER_EVENT_KIND.PRN_REJECTED
])

/**
 * `decemberAmount`/`decemberAvailableAmount` are the December portions of
 * `amount`/`availableAmount`, additive (general = `amount - decemberAmount`) and
 * absent until a December portion exists.
 *
 * @typedef {Object} LedgerBalanceSnapshot
 * @property {number} amount
 * @property {number} availableAmount
 * @property {number} [decemberAmount]
 * @property {number} [decemberAvailableAmount]
 */

/** @type {Readonly<LedgerBalanceSnapshot>} */
export const ZERO_BALANCE = Object.freeze({ amount: 0, availableAmount: 0 })

/**
 * Best-view actor for a ledger event. `id` always identifies the actor; `name`
 * and `email` are present only when the source carries a real value, and are
 * left absent otherwise.
 *
 * @typedef {Object} LedgerUserSummary
 * @property {string} id
 * @property {string} [name]
 * @property {string} [email]
 */

/**
 * Attribution for events with no recoverable real actor. The submitting
 * session for historical summary-log submissions is not persisted on the
 * summary-log document or the waste-record version, so a rebuild supplies the
 * real actor out of band where it can; absent that, events are attributed to
 * the system. Its id is also the marker the submitter recovery rejects, so a
 * placeholder can never masquerade as a recovered real actor.
 *
 * @type {Readonly<LedgerUserSummary>}
 */
export const BACKFILL_ACTOR = Object.freeze({ id: 'system', name: 'backfill' })

/**
 * `decemberCreditTotal` is optional: it is the December counterpart of
 * `creditTotal`, absent on a submission that credits no December tonnage and on
 * pre-feature events. Readers coalesce a missing value to 0.
 *
 * @typedef {{ summaryLogId: string, creditTotal: number, decemberCreditTotal?: number }} SummaryLogSubmittedPayload
 */

/**
 * `pool` is the balance the PRN draws on (ADR-0049), resolved from the PRN's
 * `isDecemberWaste` and whether the accreditation accrues December. Optional: it
 * is written only where it was resolved from a loaded accreditation - the raises
 * that debit a pool, and the December reversals - and omitted on transitions
 * that load none (accept, reject) rather than guessed. A reader coalesces an
 * absent pool to `general`, as it does a pre-feature event.
 *
 * @typedef {{ prnId: string, amount: number, pool?: Pool }} PrnPayload
 */

/**
 * The acceptance event may also carry the year selected by the accepter. It
 * belongs in the event so a PRN projection can be recovered after an
 * event-first write succeeds but its projection persistence fails.
 *
 * @typedef {PrnPayload & { obligationYear?: number }} PrnAcceptedPayload
 */

/**
 * The identity of an accreditation, or of a registration in its registered-only
 * phase (`accreditationId` null). An accreditation belongs to a registration,
 * which belongs to an organisation: all three ids are constitutive, and naming
 * one names those above it. Named for what it is: a registration or
 * accreditation identity, not a ledger-specific type. It is what we key a waste
 * balance ledger by.
 *
 * @typedef {Object} RegistrationOrAccreditationId
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string | null} accreditationId
 */

/**
 * The id of a waste balance ledger: a ledger is identified by the registration
 * or accreditation whose balance it records. An alias, so ledger-layer code can
 * name a ledger id while the value remains, honestly, a registration or
 * accreditation identity.
 *
 * @typedef {RegistrationOrAccreditationId} WasteBalanceLedgerId
 */

/**
 * A position within a waste balance ledger: the ledger id plus a sequence
 * number. The head a decision reads at, the slot it commits to (`number + 1`),
 * and the coordinate a slot-conflict or sequence error reports on a clash.
 *
 * @typedef {WasteBalanceLedgerId & { number: number }} LedgerPosition
 */

/**
 * Shape accepted by `WasteBalanceLedgerRepository.appendEvents`: the content of
 * an event at a `LedgerPosition`. Mirrors `ledgerEventInsertSchema` — keep the
 * two in sync; the schema is the runtime gate, this typedef is the check-time
 * gate.
 *
 * @typedef {LedgerPosition & {
 *   kind: LedgerEventKind,
 *   payload: SummaryLogSubmittedPayload | PrnPayload | PrnAcceptedPayload,
 *   openingBalance: LedgerBalanceSnapshot,
 *   closingBalance: LedgerBalanceSnapshot,
 *   createdAt: Date,
 *   createdBy: LedgerUserSummary
 * }} LedgerEventInsert
 */

/**
 * Shape returned by `WasteBalanceLedgerRepository` reads: exactly what was
 * written.
 *
 * @typedef {LedgerEventInsert} LedgerEvent
 */

const userSummarySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string(),
  email: Joi.string()
})

const balanceSnapshotSchema = Joi.object({
  amount: Joi.number().required(),
  availableAmount: Joi.number().required(),
  decemberAmount: Joi.number(),
  decemberAvailableAmount: Joi.number()
})

const summaryLogPayloadSchema = Joi.object({
  summaryLogId: Joi.string().required(),
  creditTotal: Joi.number().required(),
  decemberCreditTotal: Joi.number()
})

const prnPayloadSchema = Joi.object({
  prnId: Joi.string().required(),
  amount: Joi.number().required(),
  pool: Joi.string().valid(...poolValues)
})

const prnAcceptedPayloadSchema = prnPayloadSchema.keys({
  obligationYear: Joi.number().integer()
})

export const ledgerEventInsertSchema = Joi.object({
  registrationId: Joi.string().required(),
  accreditationId: Joi.string().allow(null).required(),
  organisationId: Joi.string().required(),
  number: Joi.number().integer().min(1).required(),
  kind: Joi.string()
    .valid(...kindValues)
    .required(),
  payload: Joi.when('kind', {
    is: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    then: summaryLogPayloadSchema.required()
  })
    .when('kind', {
      is: LEDGER_EVENT_KIND.PRN_ACCEPTED,
      then: prnAcceptedPayloadSchema.required()
    })
    .when('kind', {
      is: Joi.string().valid(
        LEDGER_EVENT_KIND.PRN_CREATED,
        LEDGER_EVENT_KIND.PRN_ISSUED,
        LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED,
        LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
        LEDGER_EVENT_KIND.PRN_REJECTED
      ),
      then: prnPayloadSchema.required()
    }),
  openingBalance: balanceSnapshotSchema.required(),
  closingBalance: balanceSnapshotSchema.required(),
  createdAt: Joi.date().required(),
  createdBy: userSummarySchema.required()
}).custom((value, helpers) => {
  if (value.accreditationId === null && PRN_KINDS.has(value.kind)) {
    return helpers.error('any.custom', {
      message:
        'PRN events are invalid in registered-only ledgers (accreditationId is null)'
    })
  }
  return value
})
