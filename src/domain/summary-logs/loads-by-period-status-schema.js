import Joi from 'joi'

/**
 * Shared Joi schema for loads classified by reporting period status.
 *
 * Used by both repository (storage validation) and route (response validation).
 */

// Per-bucket cap on listed rows. The producer (period-status.js) truncates to
// this and the schema validates it; sharing one constant keeps them in step.
// Matches MAX_ROW_IDS in load-counts.js.
export const MAX_ROWS_PER_BUCKET = 100

// One listed load: its identity and distinct exclusion reason codes (empty for
// an included load).
const rowDetailSchema = Joi.object({
  rowId: Joi.string().required(),
  tableName: Joi.string().required(),
  exclusionReasons: Joi.array().items(Joi.string()).required()
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

export const loadsByReportingPeriodSchema = Joi.object({
  openPeriodLoads: periodStatusByChangeSchema.required(),
  closedPeriodLoads: periodStatusByChangeSchema.required()
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
  closedPeriodLoads: emptyChange()
})
