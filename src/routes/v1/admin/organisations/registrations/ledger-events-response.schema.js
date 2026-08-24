import Joi from 'joi'

import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'

/**
 * The ledger the events belong to. A stored event repeats all three ids on
 * every row, and all three name the ledger rather than the event, so they are
 * stated once. `accreditationId` is null for the ledger a registration keeps
 * before it holds an accreditation, which the registration route addresses.
 */
const ledgerSchema = Joi.object({
  organisationId: Joi.string().required(),
  registrationId: Joi.string().required(),
  accreditationId: Joi.string().allow(null).required()
})

const balanceSchema = Joi.object({
  total: Joi.number().required(),
  available: Joi.number().required()
})

/**
 * A ledger records the best view of an actor it holds, so neither the name nor
 * the email is promised. Narrowing this to require either would refuse an event
 * the ledger legitimately carries.
 */
const actorSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string(),
  email: Joi.string()
})

/**
 * `creditTotal` is the total the summary log itself states, not the amount the
 * balance moved. A submission moves the balance by the difference between its
 * total and the previous submission's, so on a ledger holding no notes the two
 * figures read alike and mean different things.
 */
const summaryLogSchema = Joi.object({
  id: Joi.string().required(),
  creditTotal: Joi.number().required()
})

/**
 * `tonnage` is the tonnage of the note itself, not the amount the balance
 * moved. Accepting or rejecting a note moves neither total.
 */
const prnSchema = Joi.object({
  id: Joi.string().required(),
  tonnage: Joi.number().required()
})

/**
 * What every event states, whichever thing it concerns.
 *
 * `number` is the event's position in its ledger. It is also the slot a writer
 * commits to, so stating it hands out a storage fact; the back-office lists it
 * as the event's ordinal, so it is stated here by decision rather than by
 * default.
 */
const commonEventKeys = {
  number: Joi.number().integer().min(1).required(),
  createdAt: Joi.date().required(),
  createdBy: actorSchema.required(),
  balance: Joi.object({
    opening: balanceSchema.required(),
    closing: balanceSchema.required()
  }).required()
}

const summaryLogEventSchema = Joi.object({
  ...commonEventKeys,
  kind: Joi.string().valid(LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED).required(),
  summaryLog: summaryLogSchema.required()
}).label('SummaryLogLedgerEvent')

/**
 * Each kind that concerns a note is named here rather than taken as whatever
 * the store's set of kinds holds today. A kind added to the ledger therefore
 * reaches no reader until someone states which of these two shapes it takes.
 */
const prnEventSchema = Joi.object({
  ...commonEventKeys,
  kind: Joi.string()
    .valid(
      LEDGER_EVENT_KIND.PRN_CREATED,
      LEDGER_EVENT_KIND.PRN_ISSUED,
      LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED,
      LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
      LEDGER_EVENT_KIND.PRN_ACCEPTED,
      LEDGER_EVENT_KIND.PRN_REJECTED
    )
    .required(),
  prn: prnSchema.required()
}).label('PrnLedgerEvent')

/**
 * The width of a waste balance ledger read, enforced at the wire.
 *
 * An event is one of two whole shapes, and `kind` decides which. A reader that
 * knows the kind therefore knows which key holds the tonnage, and no event
 * offers both subjects or neither.
 *
 * Swagger 2.0 has no union, so `/swagger` cannot state that. It describes an
 * event as the first shape and carries the second under the `x-alternatives`
 * extension, which a standard reader ignores. The generated document therefore
 * understates the contract, and this file states it.
 *
 * The ledger view builds each event from named fields, so an unexpected key can
 * only arrive if someone adds one to the view. This schema makes that arrival a
 * failed response instead of a served one, which is the guarantee the two
 * routes offer their callers.
 */
export const ledgerEventsResponseSchema = Joi.object({
  ledger: ledgerSchema.required(),
  events: Joi.array()
    .items(Joi.alternatives().try(summaryLogEventSchema, prnEventSchema))
    .required()
})
