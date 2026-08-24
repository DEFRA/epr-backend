import Boom from '@hapi/boom'

import { ledgerEventInsertSchema } from './ledger-schema.js'

/**
 * @returns {import('./ledger-schema.js').LedgerEventInsert}
 */
export const validateLedgerEventInsert = (data) => {
  const { error, value } = ledgerEventInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid ledger event data: ${details}`)
  }

  return value
}

/**
 * A read validates the shape a write states, because the store adds nothing to
 * it. The two differ in whose fault a refusal is: bad insert data comes from a
 * caller, and a stored document that fails is our own defect.
 *
 * The event is named by its ledger and number rather than by any document id,
 * which is how a reader addresses it.
 *
 * @returns {import('./ledger-schema.js').LedgerEvent}
 */
export const validateLedgerEventRead = (data) => {
  const { error, value } = ledgerEventInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badImplementation(
      `Invalid ledger event for organisation ${data.organisationId} registration ${data.registrationId} accreditation ${data.accreditationId} number ${data.number}: ${details}`
    )
  }

  return value
}
