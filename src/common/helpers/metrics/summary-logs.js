import { config } from '#root/config.js'
import {
  createMetricsLogger,
  StorageResolution,
  Unit
} from 'aws-embedded-metrics'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Records a count metric
 * @param {string} metricName - The name of the metric
 * @param {number} count - The count to record
 */
async function recordCountMetric(metricName, count) {
  if (!config.get('isMetricsEnabled')) {
    return
  }

  try {
    const metricsLogger = createMetricsLogger()
    metricsLogger.putMetric(
      metricName,
      count,
      Unit.Count,
      StorageResolution.Standard
    )
    await metricsLogger.flush()
  } catch (error) {
    logger.error(error, error.message)
  }
}

/**
 * Records a summary log status transition metric
 * @param {string} status - The status transitioned to
 */
async function recordStatusTransition(status) {
  await recordCountMetric(`summaryLog.status.${status}`, 1)
}

/**
 * Records the count of waste records created during submission
 * @param {number} count - The number of records created
 */
async function recordWasteRecordsCreated(count) {
  await recordCountMetric('summaryLog.wasteRecords.created', count)
}

/**
 * Records the count of waste records updated during submission
 * @param {number} count - The number of records updated
 */
async function recordWasteRecordsUpdated(count) {
  await recordCountMetric('summaryLog.wasteRecords.updated', count)
}

export const summaryLogMetrics = {
  recordStatusTransition,
  recordWasteRecordsCreated,
  recordWasteRecordsUpdated
}
