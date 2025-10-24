/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */

/**
 * @typedef {Object} ParsedSummaryLog
 * @property {Object} meta - Metadata extracted from the summary log
 * @property {Object} data - Data extracted from the summary log
 */

/**
 * @typedef {Object} SummaryLogExtractor
 * @property {(summaryLog: SummaryLog) => Promise<ParsedSummaryLog>} extract
 */
