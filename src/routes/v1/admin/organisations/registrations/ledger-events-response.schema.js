import Joi from 'joi'

import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'

/**
 * The ledger the entries belong to. A stored event repeats all three ids on
 * every row, and all three name the ledger rather than the entry, so they are
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
 * the email is promised. Narrowing this to require either would refuse an entry
 * the ledger legitimately carries.
 */
const actorSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string(),
  email: Joi.string()
})

const summaryLogSchema = Joi.object({
  id: Joi.string().required(),
  creditTotal: Joi.number().required()
})

const prnSchema = Joi.object({
  id: Joi.string().required(),
  tonnage: Joi.number().required()
})

/**
 * `kind` decides which of the two subjects an entry carries, and the other is
 * refused. A reader that knows the kind therefore knows which key holds the
 * tonnage, and no entry offers both or neither.
 *
 * `number` is the entry's position in its ledger. It is also the slot a writer
 * commits to, so exposing it hands out a storage fact; the back-office lists it
 * as the entry's ordinal, so it is stated here by decision rather than by
 * default.
 */
const entrySchema = Joi.object({
  number: Joi.number().integer().min(1).required(),
  kind: Joi.string()
    .valid(...Object.values(LEDGER_EVENT_KIND))
    .required(),
  createdAt: Joi.date().required(),
  createdBy: actorSchema.required(),
  balance: Joi.object({
    opening: balanceSchema.required(),
    closing: balanceSchema.required()
  }).required(),
  summaryLog: Joi.when('kind', {
    is: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    then: summaryLogSchema.required(),
    otherwise: Joi.forbidden()
  }),
  prn: Joi.when('kind', {
    is: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    then: Joi.forbidden(),
    otherwise: prnSchema.required()
  })
})

/**
 * The width of a waste balance ledger read, enforced at the wire.
 *
 * The ledger view builds each entry from named fields, so an unexpected key can
 * only arrive if someone adds one to the view. This schema makes that arrival a
 * failed response instead of a served one, which is the guarantee the two
 * routes offer their callers.
 */
export const ledgerEventsResponseSchema = Joi.object({
  ledger: ledgerSchema.required(),
  events: Joi.array().items(entrySchema).required()
})
