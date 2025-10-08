import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { getS3File } from '#common/helpers/s3/get-s3-file.js'
import { logger } from '#common/helpers/logging/logger.js'
import { parseSummaryLog } from '#common/helpers/summary-logs/parse-summary-log.js'
import { validateSummaryLog } from '#common/helpers/summary-logs/validate-summary-log.js'

export async function validateWorker({ s3Bucket, s3Key, fileId, filename }) {
  const s3Path = `${s3Bucket}/${s3Key}`

  try {
    logger.info({
      message: `Validating summary log [${fileId}] with name [${filename}]`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    const summaryLog = await getS3File({ s3Bucket, s3Key })

    logger.info({
      message: `Fetched summary log [${fileId}] with name [${filename}] from S3 using path [${s3Path}]`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })

    const json = await parseSummaryLog({
      summaryLog,
      filename
    })

    logger.info({
      message: `Parsed [${json.sections.length}] sections from summary log [${fileId}] with name [${filename}]`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })

    await validateSummaryLog({ summaryLog: json, filename })

    logger.info({
      message: `Validation success for summary log [${fileId}] with name [${filename}]`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_SUCCESS
      }
    })

    return {
      success: true
    }
  } catch (err) {
    logger.error(err, {
      message: `Validation failure for summary log [${fileId}] with name [${filename}]`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      }
    })

    throw err
  }
}
