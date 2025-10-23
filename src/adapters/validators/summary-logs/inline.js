import { summaryLogsValidator } from '#application/summary-logs/validator.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

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
    validate: async (summaryLogId) => {
      summaryLogsValidator({
        uploadsRepository,
        summaryLogsRepository,
        summaryLogsParser,
        summaryLogId
      }).catch((error) => {
        logger.error({
          error,
          message: `Summary log validation worker failed: summaryLogId=${summaryLogId}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
          }
        })
      })
    }
  }
}
