import Joi from 'joi'

const cell = Joi.alternatives()
  .try(Joi.string(), Joi.number(), Joi.boolean())
  .allow(null)

const tableSchema = Joi.object({
  headers: Joi.array().items(Joi.string()).min(1).required(),
  rows: Joi.array().items(Joi.array().items(cell)).min(1).required()
})

export const summaryLogContentPayloadSchema = Joi.object({
  meta: Joi.object().pattern(Joi.string(), cell.disallow(null)).required(),
  data: Joi.object().pattern(Joi.string(), tableSchema).required()
})

/**
 * @typedef {string | number | boolean | null} Cell
 * @typedef {{ headers: string[], rows: Cell[][] }} TableContent
 * @typedef {{ meta: Record<string, Exclude<Cell, null>>, data: Record<string, TableContent> }} SummaryLogContentPayload
 */
