import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

import { summaryLogsValidatorWorker } from '#workers/summary-logs/worker/worker.js'

/** @typedef {import('#domain/summary-logs/validator/port.js').SummaryLogsValidator} SummaryLogsValidator */

/**
 * @returns {SummaryLogsValidator}
 */
export const createInlineSummaryLogsValidator = (
  uploadsRepository,
  summaryLogsParser,
  summaryLogsRepository
) => {
  return {
    validate: async ({ id, version, summaryLog }) => {
      summaryLogsValidatorWorker({
        uploadsRepository,
        summaryLogsParser,
        summaryLogsRepository,
        id,
        version,
        summaryLog
      }).catch((error) => {
        logger.error({
          error,
          message: `Summary log validation worker failed: summaryLogId=${id}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
          }
        })
      })
    }
  }
}
