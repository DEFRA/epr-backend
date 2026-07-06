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

const PRN_KINDS = new Set([
  LEDGER_EVENT_KIND.PRN_CREATED,
  LEDGER_EVENT_KIND.PRN_ISSUED,
  LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED,
  LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
  LEDGER_EVENT_KIND.PRN_ACCEPTED,
  LEDGER_EVENT_KIND.PRN_REJECTED
])

/**
 * @typedef {Object} LedgerBalanceSnapshot
 * @property {number} amount
 * @property {number} availableAmount
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
 * @typedef {{ summaryLogId: string, creditTotal: number }} SummaryLogSubmittedPayload
 */

/**
 * @typedef {{ prnId: string, amount: number }} PrnPayload
 */

/**
 * The identity of an accreditation, or of a registration in its registered-only
 * phase (`accreditationId` null). `organisationId` is denormalised owner context
 * carried for attribution — the storage uniqueness key is
 * `(registrationId, accreditationId)`, not org — but it always travels with the
 * id and any event can recover it. Named for what it is: a registration or
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
 *   payload: SummaryLogSubmittedPayload | PrnPayload,
 *   openingBalance: LedgerBalanceSnapshot,
 *   closingBalance: LedgerBalanceSnapshot,
 *   createdAt: Date,
 *   createdBy: LedgerUserSummary
 * }} LedgerEventInsert
 */

/**
 * Shape returned by `WasteBalanceLedgerRepository` reads — `LedgerEventInsert` plus
 * the storage-assigned `id`.
 *
 * @typedef {LedgerEventInsert & { id: string }} LedgerEvent
 */

const userSummarySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string(),
  email: Joi.string()
})

const balanceSnapshotSchema = Joi.object({
  amount: Joi.number().required(),
  availableAmount: Joi.number().required()
})

const summaryLogPayloadSchema = Joi.object({
  summaryLogId: Joi.string().required(),
  creditTotal: Joi.number().required()
})

const prnPayloadSchema = Joi.object({
  prnId: Joi.string().required(),
  amount: Joi.number().required()
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
  }).when('kind', {
    is: Joi.string().valid(
      LEDGER_EVENT_KIND.PRN_CREATED,
      LEDGER_EVENT_KIND.PRN_ISSUED,
      LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED,
      LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
      LEDGER_EVENT_KIND.PRN_ACCEPTED,
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

export const ledgerEventReadSchema = ledgerEventInsertSchema.keys({
  id: Joi.string().required()
})
