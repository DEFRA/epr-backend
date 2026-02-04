/** @typedef {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} SummaryLogsCommandExecutor */

/**
 * Creates a no-op summary logs command executor.
 * Placeholder for future SQS-based implementation.
 * @param {object} _logger
 * @returns {SummaryLogsCommandExecutor}
 */
export const createSqsCommandExecutor = (_logger) => {
  return {
    validate: async (_summaryLogId) => {
      // No-op - SQS implementation deferred
    },
    submit: async (_summaryLogId) => {
      // No-op - SQS implementation deferred
    }
  }
}
