import Joi from 'joi'

/**
 * Shared Joi schema for loads classified by reporting period status.
 *
 * Used by both repository (storage validation) and route (response validation).
 */

// One listed load: its identity and distinct exclusion reason codes (empty for
// an included load). Capped at 100 per bucket, mirroring MAX_ROW_IDS.
const rowDetailSchema = Joi.object({
  rowId: Joi.string().required(),
  tableName: Joi.string().required(),
  reasons: Joi.array().items(Joi.string()).required()
})

// rows is optional for backward compatibility: summary logs validated before
// this field existed have no rows. Newly validated logs always populate it.
const rowsSchema = Joi.array().items(rowDetailSchema).max(100)

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
