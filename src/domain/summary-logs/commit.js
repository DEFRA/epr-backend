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
 * @property {true} rowStatesWritten - Commits were saved for a while before validation wrote row states, and those have none to commit
 */

export const summaryLogCommitSchema = Joi.object({
  rowStatesWritten: Joi.valid(true).required(),
  contextHash: Joi.string().hex().length(64).required(),
  payload: summaryLogSubmittedTotalsSchema.required(),
  counts: Joi.object({
    created: count,
    updated: count,
    decemberWasteRowCount: count
  }).required()
}).required()

/**
 * The commit a summary log carries, or `null` when it has none that submission
 * can trust: one validated before commits were saved, or saved before a field
 * the schema now requires.
 *
 * @param {{ commit?: unknown }} summaryLog
 * @returns {SummaryLogCommit | null}
 */
export const savedCommitOf = ({ commit }) => {
  const { error, value } = summaryLogCommitSchema.validate(commit)
  return error ? null : value
}
