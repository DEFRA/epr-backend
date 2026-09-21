import Joi from 'joi'

import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'

const cell = Joi.alternatives()
  .try(Joi.string(), Joi.number(), Joi.boolean())
  .allow(null)

const valuePerHeader = Joi.ref('...headers', {
  adjust: (headers) => headers.length
})

const tableSchema = Joi.object({
  headers: Joi.array().items(Joi.string()).min(1).required(),
  rows: Joi.array()
    .items(
      Joi.array()
        .items(cell)
        .length(valuePerHeader)
        .messages({ 'array.length': 'must hold one value per header' })
    )
    .min(1)
    .required()
})

export const summaryLogContentPayloadSchema = Joi.object({
  meta: Joi.object({
    [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]: Joi.forbidden(),
    [SUMMARY_LOG_META_FIELDS.TEMPLATE_VERSION]: Joi.forbidden()
  })
    .pattern(Joi.string(), cell.disallow(null))
    .required(),
  data: Joi.object().pattern(Joi.string(), tableSchema).required()
})

/**
 * @typedef {string | number | boolean | null} Cell
 * @typedef {{ headers: string[], rows: Cell[][] }} TableContent
 * @typedef {{ meta: Record<string, Exclude<Cell, null>>, data: Record<string, TableContent> }} SummaryLogContentPayload
 */
