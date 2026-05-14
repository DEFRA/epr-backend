import { Decimal128 } from 'mongodb'

import { toDecimalString, toNumber } from '#common/helpers/decimal-utils.js'

/**
 * Storage encoding for stream event amount fields.
 *
 * The schema accepts amounts as JS numbers (the application boundary). The
 * MongoDB adapter persists every amount as `Decimal128` so accumulated
 * balances do not suffer the IEEE 754 drift a BSON Double would silently
 * introduce. Reads convert back to JS numbers via `toNumber` so callers
 * stay in the same shape they handed in.
 *
 * Only the amount fields need conversion — the slot `number`, identifiers,
 * and dates pass through unchanged.
 */

/**
 * @param {number} value
 * @returns {import('mongodb').Decimal128}
 */
const toDecimal128 = (value) => Decimal128.fromString(toDecimalString(value))

/**
 * @param {import('./stream-schema.js').StreamBalanceSnapshot} snapshot
 */
const snapshotToMongo = (snapshot) => ({
  amount: toDecimal128(snapshot.amount),
  availableAmount: toDecimal128(snapshot.availableAmount)
})

/**
 * @param {{ amount: unknown, availableAmount: unknown }} snapshot
 * @returns {import('./stream-schema.js').StreamBalanceSnapshot}
 */
const snapshotFromMongo = (snapshot) => ({
  amount: toNumber(/** @type {*} */ (snapshot.amount)),
  availableAmount: toNumber(/** @type {*} */ (snapshot.availableAmount))
})

/**
 * @param {import('./stream-schema.js').StreamEventInsert} event
 */
const payloadToMongo = (event) => {
  if (event.kind === 'summary-log-submitted') {
    return {
      summaryLogId: event.payload.summaryLogId,
      creditTotal: toDecimal128(/** @type {*} */ (event.payload).creditTotal)
    }
  }
  return {
    prnId: /** @type {*} */ (event.payload).prnId,
    amount: toDecimal128(/** @type {*} */ (event.payload).amount)
  }
}

/**
 * @param {string} kind
 * @param {Record<string, unknown>} payload
 */
const payloadFromMongo = (kind, payload) => {
  if (kind === 'summary-log-submitted') {
    return {
      summaryLogId: payload.summaryLogId,
      creditTotal: toNumber(/** @type {*} */ (payload.creditTotal))
    }
  }
  return {
    prnId: payload.prnId,
    amount: toNumber(/** @type {*} */ (payload.amount))
  }
}

/**
 * Convert the amount fields of a stream event insert document to BSON
 * Decimal128. Other fields pass through unchanged.
 *
 * @param {import('./stream-schema.js').StreamEventInsert} event
 */
export const streamInsertToMongo = (event) => ({
  ...event,
  openingBalance: snapshotToMongo(event.openingBalance),
  closingBalance: snapshotToMongo(event.closingBalance),
  payload: payloadToMongo(event)
})

/**
 * Convert the amount fields of a stream event MongoDB document back to
 * JS numbers.
 *
 * @param {Record<string, unknown>} doc
 */
export const streamDocumentFromMongo = (doc) => ({
  ...doc,
  openingBalance: snapshotFromMongo(/** @type {*} */ (doc.openingBalance)),
  closingBalance: snapshotFromMongo(/** @type {*} */ (doc.closingBalance)),
  payload: payloadFromMongo(
    /** @type {string} */ (doc.kind),
    /** @type {*} */ (doc.payload)
  )
})
