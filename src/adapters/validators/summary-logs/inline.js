import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
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
  summaryLogsRepository,
  organisationsRepository
) => {
  const summaryLogExtractor = createSummaryLogExtractor({
    uploadsRepository,
    logger
  })

  const validateSummaryLog = createSummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    summaryLogExtractor
  })

  return {
    validate: async (summaryLogId) => {
      // Fire-and-forget: validation runs asynchronously, request returns immediately
      // Intentionally not awaiting as the HTTP response completes before validation finishes
      validateSummaryLog(summaryLogId).catch((error) => {
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
