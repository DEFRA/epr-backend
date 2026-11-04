/** @import {Brand} from '#common/helpers/brand.js' */

/**
 * A summary log's document id, and the id of the file uploaded to it. They are
 * different values. The waste balance ledger and a report's source record the
 * file id, under the name `summaryLogId`.
 *
 * @typedef {Brand<string, 'SummaryLogId'>} SummaryLogId
 * @typedef {Brand<string, 'SummaryLogFileId'>} SummaryLogFileId
 */

/**
 * @param {string} value
 * @returns {SummaryLogId}
 */
export const toSummaryLogId = (value) => /** @type {SummaryLogId} */ (value)

/**
 * @param {string} value
 * @returns {SummaryLogFileId}
 */
export const toSummaryLogFileId = (value) =>
  /** @type {SummaryLogFileId} */ (value)
