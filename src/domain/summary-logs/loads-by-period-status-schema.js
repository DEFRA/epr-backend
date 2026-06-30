import Joi from 'joi'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * Shared Joi schema for loads classified by reporting period status.
 *
 * Used by both repository (storage validation) and route (response validation).
 */

// Per-bucket cap on listed rows. The producer (period-status.js) truncates to
// this and the schema validates it; sharing one constant keeps them in step.
// Matches MAX_ROW_IDS in load-counts.js.
export const MAX_ROWS_PER_BUCKET = 100

// One listed load: its identity, distinct exclusion reason codes (empty for an
// included load) and the signed tonnage this leg contributed to the period's
// balance (0 for a non-balance-affecting load).
const rowDetailSchema = Joi.object({
  rowId: Joi.string().required(),
  wasteRecordType: Joi.string()
    .valid(...Object.values(WASTE_RECORD_TYPE))
    .required(),
  exclusionReasons: Joi.array().items(Joi.string()).required(),
  tonnageDelta: Joi.number().required()
})

// Every bucket carries a rows list; the frontend renders it only where its
// design calls for them.
const rowsSchema = Joi.array()
  .items(rowDetailSchema)
  .max(MAX_ROWS_PER_BUCKET)
  .required()

const balanceAffectingBucketSchema = Joi.object({
  count: Joi.number().integer().min(0).required(),
  tonnageDelta: Joi.number().required(),
  rows: rowsSchema
})

const nonBalanceAffectingBucketSchema = Joi.object({
  count: Joi.number().integer().min(0).required(),
  rows: rowsSchema
})

const periodStatusGroupSchema = Joi.object({
  balanceAffecting: balanceAffectingBucketSchema.required(),
  nonBalanceAffecting: nonBalanceAffectingBucketSchema.required()
})

const periodStatusByChangeSchema = Joi.object({
  added: periodStatusGroupSchema.required(),
  adjusted: periodStatusGroupSchema.required()
})

// One closed (submitted) reporting period this upload added or adjusted loads
// in. Drives resubmission detection at submit time.
const closedPeriodSchema = Joi.object({
  year: Joi.number().integer().required(),
  cadence: Joi.string().required(),
  period: Joi.number().integer().required()
})

export const loadsByReportingPeriodSchema = Joi.object({
  openPeriodLoads: periodStatusByChangeSchema.required(),
  closedPeriodLoads: periodStatusByChangeSchema.required(),
  // Optional with a default so logs written before this field existed still
  // validate on read.
  closedPeriods: Joi.array().items(closedPeriodSchema).default([])
})

// Every bucket carries an empty rows list, matching the uniform populated
// shape produced in period-status.js.
const emptyGroup = () => ({
  balanceAffecting: { count: 0, tonnageDelta: 0, rows: [] },
  nonBalanceAffecting: { count: 0, rows: [] }
})
const emptyChange = () => ({ added: emptyGroup(), adjusted: emptyGroup() })

/** Default loadsByReportingPeriod for validated logs without period-status data. */
export const emptyLoadsByReportingPeriod = () => ({
  openPeriodLoads: emptyChange(),
  closedPeriodLoads: emptyChange(),
  closedPeriods: []
})
