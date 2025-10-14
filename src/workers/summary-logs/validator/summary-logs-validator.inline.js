import { summaryLogsValidatorWorker } from '#workers/summary-logs/validator/worker/summary-logs-validator-worker.js'

/** @typedef {import('./summary-logs-validator.port.js').SummaryLogsValidator} SummaryLogsValidator */

/**
 * @returns {SummaryLogsValidator}
 */
export const createInlineSummaryLogsValidator = (summaryLogsRepository) => {
  return {
    validate: async (summaryLog) => {
      summaryLogsValidatorWorker({ summaryLogsRepository, summaryLog }).catch(
        () => {
          console.log('Summary log validation failed')
        }
      )
    }
  }
}
