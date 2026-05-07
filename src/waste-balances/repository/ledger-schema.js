import Joi from 'joi'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

export const LEDGER_TRANSACTION_TYPE = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit'
})

/**
 * @typedef {typeof LEDGER_TRANSACTION_TYPE[keyof typeof LEDGER_TRANSACTION_TYPE]} LedgerTransactionType
 */

export const LEDGER_SOURCE_KIND = Object.freeze({
  SUMMARY_LOG_ROW: 'summary-log-row',
  PRN_OPERATION: 'prn-operation'
})

/**
 * @typedef {typeof LEDGER_SOURCE_KIND[keyof typeof LEDGER_SOURCE_KIND]} LedgerSourceKind
 */

export const LEDGER_PRN_OPERATION_TYPE = Object.freeze({
  CREATED: 'created',
  ISSUED: 'issued',
  CANCELLED: 'cancelled',
  ISSUED_CANCELLED: 'issued-cancelled'
})

/**
 * @typedef {typeof LEDGER_PRN_OPERATION_TYPE[keyof typeof LEDGER_PRN_OPERATION_TYPE]} LedgerPrnOperationType
 */

const typeValues = Object.values(LEDGER_TRANSACTION_TYPE)
const rowTypeValues = Object.values(WASTE_RECORD_TYPE)
const prnOperationTypeValues = Object.values(LEDGER_PRN_OPERATION_TYPE)

const userSummarySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required()
})

const wasteRecordSchema = Joi.object({
  type: Joi.string()
    .valid(...rowTypeValues)
    .required(),
  rowId: Joi.string().required(),
  versionId: Joi.string().required(),
  creditedAmount: Joi.number().required()
})

const summaryLogRowSourceSchema = Joi.object({
  summaryLogId: Joi.string().required(),
  wasteRecord: wasteRecordSchema.required()
})

const prnOperationSourceSchema = Joi.object({
  prnId: Joi.string().required(),
  operationType: Joi.string()
    .valid(...prnOperationTypeValues)
    .required()
})

const sourceSchema = Joi.object({
  kind: Joi.string()
    .valid(...Object.values(LEDGER_SOURCE_KIND))
    .required(),
  summaryLogRow: summaryLogRowSourceSchema,
  prnOperation: prnOperationSourceSchema
})
  .when(Joi.object({ kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW }).unknown(), {
    then: Joi.object({
      summaryLogRow: summaryLogRowSourceSchema.required(),
      prnOperation: Joi.forbidden()
    })
  })
  .when(Joi.object({ kind: LEDGER_SOURCE_KIND.PRN_OPERATION }).unknown(), {
    then: Joi.object({
      prnOperation: prnOperationSourceSchema.required(),
      summaryLogRow: Joi.forbidden()
    })
  })

/**
 * @typedef {Object} LedgerWasteRecord
 * @property {import('#domain/waste-records/model.js').WasteRecordType} type
 * @property {string} rowId
 * @property {string} versionId
 * @property {number} creditedAmount
 *   Running net credit total on this waste record after this transaction.
 *   `previousCreditedAmount + delta = creditedAmount`, where
 *   `previousCreditedAmount` comes from the latest prior matching
 *   transaction or zero if none.
 */

/**
 * @typedef {Object} LedgerSummaryLogRow
 * @property {string} summaryLogId
 * @property {LedgerWasteRecord} wasteRecord
 */

/**
 * @typedef {Object} LedgerPrnOperation
 * @property {string} prnId
 * @property {LedgerPrnOperationType} operationType
 *   The PRN lifecycle event that produced this transaction:
 *   - `created` — ringfences `tonnage` against availableAmount on PRN draft
 *   - `issued` — realises the ringfence by deducting `tonnage` from the total
 *     amount (availableAmount unchanged because it was already debited at
 *     creation)
 *   - `cancelled` — releases the ringfence on PRN cancellation from the
 *     awaiting-authorisation state
 *   - `issued-cancelled` — full reversal when an issued PRN is cancelled
 *     (restores both amount and availableAmount)
 */

/**
 * Discriminated union — `kind` selects which variant carries the payload.
 * Exactly one of `summaryLogRow` / `prnOperation` is populated per transaction.
 *
 * @typedef {(
 *   { kind: (typeof LEDGER_SOURCE_KIND)['SUMMARY_LOG_ROW'], summaryLogRow: LedgerSummaryLogRow }
 *   | { kind: (typeof LEDGER_SOURCE_KIND)['PRN_OPERATION'], prnOperation: LedgerPrnOperation }
 * )} LedgerSource
 */

/**
 * @typedef {Object} LedgerUserSummary
 * @property {string} id
 * @property {string} name
 */

/**
 * Snapshot of the running balance state. `amount` is the total balance;
 * `availableAmount` is the total minus pending debits.
 *
 * @typedef {Object} LedgerBalanceSnapshot
 * @property {number} amount
 * @property {number} availableAmount
 */

/**
 * Shape accepted by `LedgerRepository.insertTransactions`. Mirrors
 * `ledgerTransactionInsertSchema` — keep the two in sync; the schema is the
 * runtime gate, this typedef is the check-time gate.
 *
 * @typedef {Object} LedgerTransactionInsert
 * @property {string} accreditationId
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {number} number
 * @property {LedgerTransactionType} type
 * @property {Date} createdAt
 * @property {LedgerUserSummary} [createdBy]
 * @property {number} amount
 * @property {LedgerBalanceSnapshot} openingBalance
 * @property {LedgerBalanceSnapshot} closingBalance
 * @property {LedgerSource} source
 */

/**
 * Shape returned by `LedgerRepository` reads — `LedgerTransactionInsert` plus
 * the storage-assigned `id`.
 *
 * @typedef {LedgerTransactionInsert & { id: string }} LedgerTransaction
 */

const balanceSnapshotSchema = Joi.object({
  amount: Joi.number().required(),
  availableAmount: Joi.number().required()
})

export const ledgerTransactionInsertSchema = Joi.object({
  accreditationId: Joi.string().required(),
  organisationId: Joi.string().required(),
  registrationId: Joi.string().required(),
  number: Joi.number().integer().min(1).required(),
  type: Joi.string()
    .valid(...typeValues)
    .required(),
  createdAt: Joi.date().required(),
  createdBy: userSummarySchema.optional(),
  amount: Joi.number().required(),
  openingBalance: balanceSnapshotSchema.required(),
  closingBalance: balanceSnapshotSchema.required(),
  source: sourceSchema.required()
})

export const ledgerTransactionReadSchema = ledgerTransactionInsertSchema.keys({
  id: Joi.string().required()
})
