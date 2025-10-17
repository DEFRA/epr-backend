import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-log.js'

export const summaryLogsValidatorWorker = async ({
  summaryLogsRepository,
  id,
  version,
  _summaryLog
}) => {
  logger.info({
    message: `Summary log validation worker started [${id}]`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.WORKER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  // fetch spreadsheet from S3, parse and validate...
  await new Promise((resolve) => setTimeout(resolve, 1000)) // This is temporary to emulate the delay until we implement parsing...

  const status = SUMMARY_LOG_STATUS.INVALID

  await summaryLogsRepository.update(id, version, {
    status
  })

  logger.info({
    message: `Summary log validation status updated [${id}] to [${status}]`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.WORKER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}
