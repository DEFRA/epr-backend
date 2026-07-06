import Boom from '@hapi/boom'

import {
  ledgerEventInsertSchema,
  ledgerEventReadSchema
} from './ledger-schema.js'

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
 * @returns {import('./ledger-schema.js').LedgerEvent}
 */
export const validateLedgerEventRead = (data) => {
  const { error, value } = ledgerEventReadSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badImplementation(`Invalid ledger event ${data.id}: ${details}`)
  }

  return value
}
