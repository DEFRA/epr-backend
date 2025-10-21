/**
 * @typedef {Object} ValidationRequest
 * @property {string} id
 * @property {number} version
 * @property {Object} summaryLog
 */

/**
 * @typedef {Object} SummaryLogsValidator
 * @property {(request: ValidationRequest) => Promise<void>} validate
 */
