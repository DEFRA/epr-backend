import Joi from 'joi'

import { ledgerIdKeys } from '#waste-balances/repository/ledger-schema.js'

import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { CLASSIFICATION_REASON } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * @typedef {import('#waste-balances/domain/waste-balance-classification.js').WasteBalanceOutcome} WasteBalanceOutcome
 */

/**
 * Stamped classification for a summary-log row state. `outcome` and
 * `transactionAmount` are the row's contribution to the waste balance at the
 * time it committed; `reasons` carry the codes explaining a non-included row.
 * A NOT_APPLICABLE outcome stamps a row whose registration or template cannot
 * contribute a per-row waste-balance decision at all.
 *
 * @typedef {Object} RowClassification
 * @property {WasteBalanceOutcome} outcome
 * @property {Array<{ code: string, field?: string }>} reasons
 * @property {number} transactionAmount
 */

/** @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js' */

/**
 * A single row from the 1.1 per-row classification list — the unit
 * `upsertSummaryLogRowStates` compares and stores. Carries no ledger-identity fields (supplied
 * separately) and no membership (assigned at write).
 *
 * `processingType` is the template the row reported under. One summary log is
 * one uploaded workbook, so every row of a given log carries the same value —
 * but a registration can report under different templates across its logs, so
 * it belongs to the row rather than to the registration.
 *
 * @typedef {Object} SummaryLogRowStateEntry
 * @property {string} rowId
 * @property {import('#domain/waste-records/model.js').WasteRecordType} wasteRecordType
 * @property {import('#domain/summary-logs/meta-fields.js').ProcessingType} processingType
 * @property {Record<string, any>} data
 * @property {RowClassification} classification
 */

/**
 * @typedef {{
 *   wasteRecordType: import('#domain/waste-records/model.js').WasteRecordType,
 *   rowId: string,
 *   processingType: import('#domain/summary-logs/meta-fields.js').ProcessingType,
 *   data: Record<string, any>,
 *   classification: RowClassification,
 *   summaryLogIds: import('#domain/summary-logs/ids.js').SummaryLogFileId[]
 * }} RowStateFields
 */

/**
 * Shape accepted by the row-states schema for a document to store — a ledger
 * identity, a row entry's content + classification, and the
 * membership of submissions that produced this exact state.
 *
 * @typedef {RowStateFields & WasteBalanceLedgerId} SummaryLogRowStateInsert
 */

/**
 * Shape returned by reads — the stored fields plus the storage-assigned `id`.
 *
 * @typedef {RowStateFields & WasteBalanceLedgerId & { id: string }} SummaryLogRowState
 */

const classificationReasonSchema = Joi.object({
  code: Joi.string()
    .valid(...Object.values(CLASSIFICATION_REASON))
    .required(),
  field: Joi.string()
})

const classificationSchema = Joi.object({
  outcome: Joi.string()
    .valid(...Object.values(WASTE_BALANCE_OUTCOME))
    .required(),
  reasons: Joi.array().items(classificationReasonSchema).required(),
  transactionAmount: Joi.number().required()
})

const rowStateBaseSchema = Joi.object({
  wasteRecordType: Joi.string()
    .valid(...Object.values(WASTE_RECORD_TYPE))
    .required(),
  rowId: Joi.string().required(),
  processingType: Joi.string().required(),
  data: Joi.object().required(),
  classification: classificationSchema.required(),
  summaryLogIds: Joi.array().items(Joi.string().required()).min(1).required()
})

export const summaryLogRowStateInsertSchema =
  rowStateBaseSchema.keys(ledgerIdKeys)

export const summaryLogRowStateReadSchema = rowStateBaseSchema.keys({
  ...ledgerIdKeys,
  id: Joi.string().required()
})
