import Joi from 'joi'

import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'

/**
 * The ledger the events belong to. `accreditationId` is null for the ledger a
 * registration keeps before it holds an accreditation, which the registration
 * route addresses.
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
 * the email is promised.
 */
const actorSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string(),
  email: Joi.string()
})

/**
 * `creditTotal` is the total the summary log itself states, not the amount the
 * balance moved. A submission moves the balance by the difference between its
 * total and the previous submission's.
 */
const summaryLogSchema = Joi.object({
  id: Joi.string().required(),
  creditTotal: Joi.number().required()
})

/**
 * `prnNumber` is the note's own number, the reference it is known by outside
 * the service. It is null wherever the note holds no number the read can see.
 * A reader cannot take null to mean the note is unissued: `LedgerEventResource`
 * in `src/waste-balances/application/read-ledger.js` states the cases.
 *
 * `tonnage` is the tonnage of the note itself, not the amount the balance
 * moved. Accepting or rejecting a note moves neither total.
 */
const prnSchema = Joi.object({
  id: Joi.string().required(),
  prnNumber: Joi.string().allow(null).required(),
  tonnage: Joi.number().required()
})

/**
 * What every event states, whichever thing it concerns. The ledger and the
 * `number` together address an event.
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
 * Each kind that concerns a note is named here rather than taken from the
 * store's set of kinds, so a kind added to the ledger reaches no reader until
 * someone states which shape it takes.
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
 * Mirrors `LedgerResource` in
 * `src/waste-balances/application/read-ledger.js` — keep the two in sync; this
 * schema is the runtime gate, those typedefs are the check-time gate.
 *
 * An event is one of two whole shapes, and `kind` decides which.
 *
 * Swagger 2.0 has no union, so `/swagger` describes an event as the first
 * shape and carries the second under the `x-alternatives` extension, which a
 * standard reader ignores. The generated document understates the contract.
 */
export const wasteBalanceLedgerResponseSchema = Joi.object({
  ledger: ledgerSchema.required(),
  events: Joi.array()
    .items(Joi.alternatives().try(summaryLogEventSchema, prnEventSchema))
    .required()
})
