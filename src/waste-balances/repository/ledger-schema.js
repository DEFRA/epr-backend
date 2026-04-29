import Joi from 'joi'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

export const LEDGER_TRANSACTION_TYPE = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
  PENDING_DEBIT: 'pending_debit'
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
  CREATION: 'creation',
  ISSUANCE: 'issuance',
  ACCEPTANCE: 'acceptance',
  CANCELLATION: 'cancellation',
  ISSUED_CANCELLATION: 'issued_cancellation'
})

/**
 * @typedef {typeof LEDGER_PRN_OPERATION_TYPE[keyof typeof LEDGER_PRN_OPERATION_TYPE]} LedgerPrnOperationType
 */

const typeValues = Object.values(LEDGER_TRANSACTION_TYPE)
const sourceKindValues = Object.values(LEDGER_SOURCE_KIND)
const prnOperationTypeValues = Object.values(LEDGER_PRN_OPERATION_TYPE)
const rowTypeValues = Object.values(WASTE_RECORD_TYPE)

const userSummarySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required()
})

const summaryLogRowSourceSchema = Joi.object({
  summaryLogId: Joi.string().required(),
  rowId: Joi.string().required(),
  rowType: Joi.string()
    .valid(...rowTypeValues)
    .required(),
  wasteRecordId: Joi.string().required(),
  wasteRecordVersionId: Joi.string().required()
})

const prnOperationSourceSchema = Joi.object({
  prnId: Joi.string().required(),
  operationType: Joi.string()
    .valid(...prnOperationTypeValues)
    .required()
})

const sourceSchema = Joi.object({
  kind: Joi.string()
    .valid(...sourceKindValues)
    .required(),
  summaryLogRow: Joi.when('kind', {
    is: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
    then: summaryLogRowSourceSchema.required(),
    otherwise: Joi.forbidden()
  }),
  prnOperation: Joi.when('kind', {
    is: LEDGER_SOURCE_KIND.PRN_OPERATION,
    then: prnOperationSourceSchema.required(),
    otherwise: Joi.forbidden()
  })
})

/**
 * @typedef {Object} LedgerSummaryLogRow
 * @property {string} summaryLogId
 * @property {string} rowId
 * @property {import('#domain/waste-records/model.js').WasteRecordType} rowType
 * @property {string} wasteRecordId
 * @property {string} wasteRecordVersionId
 */

/**
 * @typedef {Object} LedgerPrnOperation
 * @property {string} prnId
 * @property {LedgerPrnOperationType} operationType
 */

/**
 * Discriminated union — `kind` selects which variant carries the payload.
 *
 * @typedef {{ kind: (typeof LEDGER_SOURCE_KIND)['SUMMARY_LOG_ROW'], summaryLogRow: LedgerSummaryLogRow }
 *   | { kind: (typeof LEDGER_SOURCE_KIND)['PRN_OPERATION'], prnOperation: LedgerPrnOperation }} LedgerSource
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
