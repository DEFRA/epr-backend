import Joi from 'joi'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { CLASSIFICATION_REASON } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * @typedef {import('#domain/summary-logs/table-schemas/validation-pipeline.js').RowOutcome} RowOutcome
 */

/**
 * Stamped classification for a summary-log row state. `outcome` and
 * `transactionAmount` are the row's contribution to the waste balance at the
 * time it committed; `reasons` carry the codes explaining a non-included row.
 *
 * @typedef {Object} RowClassification
 * @property {RowOutcome} outcome
 * @property {Array<{ code: string, field?: string }>} reasons
 * @property {number} transactionAmount
 */

/**
 * Ledger identity a row state belongs to. Mirrors the event ledger identity
 * `(registrationId, accreditationId)` with `organisationId` denormalised on,
 * exactly as stream events carry it. `accreditationId` is null for
 * registered-only streams.
 *
 * @typedef {Object} WasteBalanceLedgerId
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string | null} accreditationId
 */

/**
 * A single row from the 1.1 per-row classification list — the unit
 * `upsertSummaryLogRowStates` compares and stores. Carries no ledger-identity fields (supplied
 * separately) and no membership (assigned at write).
 *
 * @typedef {Object} SummaryLogRowStateEntry
 * @property {string} rowId
 * @property {import('#domain/waste-records/model.js').WasteRecordType} wasteRecordType
 * @property {string} processingType
 * @property {Record<string, any>} data
 * @property {RowClassification} classification
 */

/**
 * Shape accepted by the row-states schema for a stored document — a ledger identity,
 * a row entry's content + classification, and the membership of submissions
 * that committed this exact state.
 *
 * @typedef {Object} SummaryLogRowStateInsert
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string | null} accreditationId
 * @property {import('#domain/waste-records/model.js').WasteRecordType} wasteRecordType
 * @property {string} rowId
 * @property {string} processingType
 * @property {Record<string, any>} data
 * @property {RowClassification} classification
 * @property {string[]} summaryLogIds
 */

/**
 * Shape returned by reads — `SummaryLogRowStateInsert` plus the storage-assigned `id`.
 *
 * @typedef {SummaryLogRowStateInsert & { id: string }} SummaryLogRowState
 */

const classificationReasonSchema = Joi.object({
  code: Joi.string()
    .valid(...Object.values(CLASSIFICATION_REASON))
    .required(),
  field: Joi.string()
})

const classificationSchema = Joi.object({
  outcome: Joi.string()
    .valid(...Object.values(ROW_OUTCOME))
    .required(),
  reasons: Joi.array().items(classificationReasonSchema).required(),
  transactionAmount: Joi.number().required()
})

export const summaryLogRowStateInsertSchema = Joi.object({
  organisationId: Joi.string().required(),
  registrationId: Joi.string().required(),
  accreditationId: Joi.string().allow(null).required(),
  wasteRecordType: Joi.string()
    .valid(...Object.values(WASTE_RECORD_TYPE))
    .required(),
  rowId: Joi.string().required(),
  processingType: Joi.string().required(),
  data: Joi.object().required(),
  classification: classificationSchema.required(),
  summaryLogIds: Joi.array().items(Joi.string().required()).min(1).required()
})

export const summaryLogRowStateReadSchema = summaryLogRowStateInsertSchema.keys(
  {
    id: Joi.string().required()
  }
)
