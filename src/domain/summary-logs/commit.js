import Joi from 'joi'

import { summaryLogSubmittedTotalsSchema } from '#waste-balances/repository/ledger-schema.js'

/** @import { SummaryLogSubmittedTotals } from '#waste-balances/repository/ledger-schema.js' */

const count = Joi.number().integer().min(0).required()

/**
 * What validation saves on a summary log so that submission can commit it
 * without reading the file again (ADR-0058).
 *
 * @typedef {Object} SummaryLogCommit
 * @property {string} contextHash - The classification context validation read
 * @property {SummaryLogSubmittedTotals} payload - The summary-log-submitted payload, less its id
 * @property {{ created: number, updated: number, decemberWasteRowCount: number }} counts
 */

export const summaryLogCommitSchema = Joi.object({
  contextHash: Joi.string().hex().length(64).required(),
  payload: summaryLogSubmittedTotalsSchema.required(),
  counts: Joi.object({
    created: count,
    updated: count,
    decemberWasteRowCount: count
  }).required()
}).required()
