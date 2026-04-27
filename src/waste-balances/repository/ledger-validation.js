import Boom from '@hapi/boom'

import {
  ledgerTransactionInsertSchema,
  ledgerTransactionReadSchema
} from './ledger-schema.js'

/**
 * @returns {import('./ledger-schema.js').LedgerTransactionInsert}
 */
export const validateLedgerTransactionInsert = (data) => {
  const { error, value } = ledgerTransactionInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid ledger transaction data: ${details}`)
  }

  return value
}

/**
 * @returns {import('./ledger-schema.js').LedgerTransaction}
 */
export const validateLedgerTransactionRead = (data) => {
  const { error, value } = ledgerTransactionReadSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badImplementation(
      `Invalid ledger transaction ${data.id}: ${details}`
    )
  }

  return value
}
