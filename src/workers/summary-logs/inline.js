import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

import { summaryLogsValidatorWorker } from '#workers/summary-logs/worker/worker.js'

/** @typedef {import('#workers/summary-logs/port.js').SummaryLogsValidator} SummaryLogsValidator */

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
