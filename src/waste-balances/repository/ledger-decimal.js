import { Decimal128 } from 'mongodb'

import { toDecimalString, toNumber } from '#common/helpers/decimal-utils.js'

/**
 * Storage encoding for ledger amount fields.
 *
 * The schema accepts amounts as JS numbers (the application boundary). The
 * MongoDB adapter persists every amount as `Decimal128` so accumulated
 * balances do not suffer the IEEE 754 drift a BSON Double would silently
 * introduce — at 73,000 transactions per accreditation per year (ADR 0031),
 * the drift would be material. Reads convert back to JS numbers via
 * `toNumber` so callers stay in the same shape they handed in.
 *
 * Summary-log-row transactions also carry `source.summaryLogRow.wasteRecord.creditedAmount`,
 * the running per-waste-record net credit total. It follows the same
 * encoding discipline.
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
 * @param {import('./ledger-schema.js').LedgerBalanceSnapshot} snapshot
 */
const snapshotToMongo = (snapshot) => ({
  amount: toDecimal128(snapshot.amount),
  availableAmount: toDecimal128(snapshot.availableAmount)
})

/**
 * @param {{ amount: unknown, availableAmount: unknown }} snapshot
 * @returns {import('./ledger-schema.js').LedgerBalanceSnapshot}
 */
const snapshotFromMongo = (snapshot) => ({
  amount: toNumber(/** @type {*} */ (snapshot.amount)),
  availableAmount: toNumber(/** @type {*} */ (snapshot.availableAmount))
})

/**
 * @param {import('./ledger-schema.js').LedgerSource} source
 */
const sourceToMongo = (source) => ({
  ...source,
  summaryLogRow: {
    ...source.summaryLogRow,
    wasteRecord: {
      ...source.summaryLogRow.wasteRecord,
      creditedAmount: toDecimal128(
        source.summaryLogRow.wasteRecord.creditedAmount
      )
    }
  }
})

const sourceFromMongo = (source) => ({
  ...source,
  summaryLogRow: {
    ...source.summaryLogRow,
    wasteRecord: {
      ...source.summaryLogRow.wasteRecord,
      creditedAmount: toNumber(
        /** @type {*} */ (source.summaryLogRow.wasteRecord.creditedAmount)
      )
    }
  }
})

/**
 * Convert the amount fields of a ledger transaction insert document to BSON
 * Decimal128. Other fields pass through unchanged.
 *
 * @param {import('./ledger-schema.js').LedgerTransactionInsert} transaction
 */
export const ledgerInsertToMongo = (transaction) => ({
  ...transaction,
  amount: toDecimal128(transaction.amount),
  openingBalance: snapshotToMongo(transaction.openingBalance),
  closingBalance: snapshotToMongo(transaction.closingBalance),
  source: sourceToMongo(transaction.source)
})

/**
 * Convert the amount fields of a ledger transaction MongoDB document back to
 * JS numbers.
 *
 * @param {Record<string, unknown> & { amount: unknown, openingBalance: { amount: unknown, availableAmount: unknown }, closingBalance: { amount: unknown, availableAmount: unknown }, source: unknown }} doc
 */
export const ledgerDocumentFromMongo = (doc) => ({
  ...doc,
  amount: toNumber(/** @type {*} */ (doc.amount)),
  openingBalance: snapshotFromMongo(doc.openingBalance),
  closingBalance: snapshotFromMongo(doc.closingBalance),
  source: sourceFromMongo(doc.source)
})
