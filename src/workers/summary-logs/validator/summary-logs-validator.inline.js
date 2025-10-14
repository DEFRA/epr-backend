import { logger } from '#common/helpers/logging/logger.js'
import { summaryLogsValidatorWorker } from '#workers/summary-logs/validator/worker/summary-logs-validator-worker.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/** @typedef {import('./summary-logs-validator.port.js').SummaryLogsValidator} SummaryLogsValidator */

/**
 * @returns {SummaryLogsValidator}
 */
export const createInlineSummaryLogsValidator = (summaryLogsRepository) => {
  return {
    validate: async (summaryLog) => {
      summaryLogsValidatorWorker({ summaryLogsRepository, summaryLog }).catch(
        (error) => {
          logger.error({
            error,
            message: `Summary log validation worker failed [${summaryLog.id}]`,
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
            }
          })
        }
      )
    }
  }
}
