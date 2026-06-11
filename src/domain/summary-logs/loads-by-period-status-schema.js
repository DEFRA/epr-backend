import Joi from 'joi'

/**
 * Shared Joi schema for loads classified by reporting period status.
 *
 * Used by both repository (storage validation) and route (response validation).
 */

const balanceAffectingBucketSchema = Joi.object({
  count: Joi.number().integer().min(0).required(),
  tonnageDelta: Joi.number().required()
})

const nonBalanceAffectingBucketSchema = Joi.object({
  count: Joi.number().integer().min(0).required()
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

const emptyGroup = () => ({
  balanceAffecting: { count: 0, tonnageDelta: 0 },
  nonBalanceAffecting: { count: 0 }
})
const emptyChange = () => ({ added: emptyGroup(), adjusted: emptyGroup() })

/** Default loadsByReportingPeriod for validated logs without period-status data. */
export const emptyLoadsByReportingPeriod = () => ({
  openPeriodLoads: emptyChange(),
  closedPeriodLoads: emptyChange()
})
