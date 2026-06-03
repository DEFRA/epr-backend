import Joi from 'joi'

export const STREAM_EVENT_KIND = Object.freeze({
  SUMMARY_LOG_SUBMITTED: 'summary-log-submitted',
  PRN_CREATED: 'prn-created',
  PRN_ISSUED: 'prn-issued',
  PRN_CREATION_CANCELLED: 'prn-creation-cancelled',
  PRN_CANCELLED_AFTER_ISSUE: 'prn-cancelled-after-issue',
  PRN_ACCEPTED: 'prn-accepted',
  PRN_REJECTED: 'prn-rejected'
})

/**
 * @typedef {typeof STREAM_EVENT_KIND[keyof typeof STREAM_EVENT_KIND]} StreamEventKind
 */

const kindValues = Object.values(STREAM_EVENT_KIND)

const PRN_KINDS = new Set([
  STREAM_EVENT_KIND.PRN_CREATED,
  STREAM_EVENT_KIND.PRN_ISSUED,
  STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
  STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
  STREAM_EVENT_KIND.PRN_ACCEPTED,
  STREAM_EVENT_KIND.PRN_REJECTED
])

/**
 * @typedef {Object} StreamBalanceSnapshot
 * @property {number} amount
 * @property {number} availableAmount
 */

/** @type {Readonly<StreamBalanceSnapshot>} */
export const ZERO_BALANCE = Object.freeze({ amount: 0, availableAmount: 0 })

/**
 * Best view of the actor behind an event. `id` is always known; the remaining
 * slots are present only when the source supplies a real value for them, absent
 * otherwise. A value is never written to a slot it does not belong in — an email
 * goes only in `email`, an id only in `id` — so an actor never asserts that a
 * person's name is their email or their id.
 *
 * @typedef {Object} StreamUserSummary
 * @property {string} id
 * @property {string} [name]
 * @property {string} [email]
 * @property {string[]} [scope]
 */

/**
 * Attribution for events with no recoverable real actor. The submitting
 * session for historical summary-log submissions is not persisted on the
 * summary-log document or the waste-record version, so a rebuild supplies the
 * real actor out of band where it can; absent that, events are attributed to
 * the system. Its id is also the marker the submitter recovery rejects, so a
 * placeholder can never masquerade as a recovered real actor.
 *
 * @type {Readonly<StreamUserSummary>}
 */
export const BACKFILL_ACTOR = Object.freeze({ id: 'system', name: 'backfill' })

/**
 * @typedef {{ summaryLogId: string, creditTotal: number }} SummaryLogSubmittedPayload
 */

/**
 * @typedef {{ prnId: string, amount: number }} PrnPayload
 */

/**
 * Shape accepted by `WasteBalanceStreamRepository.appendEvent`. Mirrors
 * `streamEventInsertSchema` — keep the two in sync; the schema is the
 * runtime gate, this typedef is the check-time gate.
 *
 * @typedef {Object} StreamEventInsert
 * @property {string} registrationId
 * @property {string | null} accreditationId
 * @property {string} organisationId
 * @property {number} number
 * @property {StreamEventKind} kind
 * @property {SummaryLogSubmittedPayload | PrnPayload} payload
 * @property {StreamBalanceSnapshot} openingBalance
 * @property {StreamBalanceSnapshot} closingBalance
 * @property {Date} createdAt
 * @property {StreamUserSummary} createdBy
 */

/**
 * Shape returned by `WasteBalanceStreamRepository` reads — `StreamEventInsert` plus
 * the storage-assigned `id`.
 *
 * @typedef {StreamEventInsert & { id: string }} StreamEvent
 */

const userSummarySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string(),
  email: Joi.string(),
  scope: Joi.array().items(Joi.string())
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

export const streamEventInsertSchema = Joi.object({
  registrationId: Joi.string().required(),
  accreditationId: Joi.string().allow(null).required(),
  organisationId: Joi.string().required(),
  number: Joi.number().integer().min(1).required(),
  kind: Joi.string()
    .valid(...kindValues)
    .required(),
  payload: Joi.when('kind', {
    is: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    then: summaryLogPayloadSchema.required()
  }).when('kind', {
    is: Joi.string().valid(
      STREAM_EVENT_KIND.PRN_CREATED,
      STREAM_EVENT_KIND.PRN_ISSUED,
      STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
      STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
      STREAM_EVENT_KIND.PRN_ACCEPTED,
      STREAM_EVENT_KIND.PRN_REJECTED
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
        'PRN events are invalid in registered-only streams (accreditationId is null)'
    })
  }
  return value
})

export const streamEventReadSchema = streamEventInsertSchema.keys({
  id: Joi.string().required()
})
