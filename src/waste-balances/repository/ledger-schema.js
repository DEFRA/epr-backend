import Joi from 'joi'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

export const LEDGER_TRANSACTION_TYPE = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
  PENDING_DEBIT: 'pending_debit'
})

export const LEDGER_SOURCE_KIND = Object.freeze({
  SUMMARY_LOG_ROW: 'summary-log-row',
  PRN_OPERATION: 'prn-operation',
  MANUAL_ADJUSTMENT: 'manual-adjustment'
})

export const LEDGER_PRN_OPERATION_TYPE = Object.freeze({
  CREATION: 'creation',
  ISSUANCE: 'issuance',
  ACCEPTANCE: 'acceptance',
  CANCELLATION: 'cancellation',
  ISSUED_CANCELLATION: 'issued_cancellation'
})

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

const manualAdjustmentSourceSchema = Joi.object({
  userId: Joi.string().required(),
  reason: Joi.string().required()
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
  }),
  manualAdjustment: Joi.when('kind', {
    is: LEDGER_SOURCE_KIND.MANUAL_ADJUSTMENT,
    then: manualAdjustmentSourceSchema.required(),
    otherwise: Joi.forbidden()
  })
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
  openingAmount: Joi.number().required(),
  closingAmount: Joi.number().required(),
  openingAvailableAmount: Joi.number().required(),
  closingAvailableAmount: Joi.number().required(),
  source: sourceSchema.required()
})

export const ledgerTransactionReadSchema = ledgerTransactionInsertSchema.keys({
  id: Joi.string().required()
})
