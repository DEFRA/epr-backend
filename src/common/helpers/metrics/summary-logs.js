import { config } from '#root/config.js'
import {
  createMetricsLogger,
  StorageResolution,
  Unit
} from 'aws-embedded-metrics'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Records a metric with the specified unit
 * @param {string} metricName - The name of the metric
 * @param {number} value - The value to record
 * @param {string} unit - The AWS CloudWatch unit (e.g. Unit.Count, Unit.Milliseconds)
 */
async function recordMetric(metricName, value, unit) {
  if (!config.get('isMetricsEnabled')) {
    return
  }

  try {
    const metricsLogger = createMetricsLogger()
    metricsLogger.putMetric(metricName, value, unit, StorageResolution.Standard)
    await metricsLogger.flush()
  } catch (error) {
    logger.error(error, error.message)
  }
}

/**
 * Records a count metric
 * @param {string} metricName - The name of the metric
 * @param {number} count - The count to record
 */
async function recordCountMetric(metricName, count) {
  await recordMetric(metricName, count, Unit.Count)
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

/**
 * Records the duration of validation processing
 * @param {number} durationMs - The duration in milliseconds
 */
async function recordValidationDuration(durationMs) {
  await recordMetric(
    'summaryLog.validation.duration',
    durationMs,
    Unit.Milliseconds
  )
}

/**
 * Records the duration of submission processing
 * @param {number} durationMs - The duration in milliseconds
 */
async function recordSubmissionDuration(durationMs) {
  await recordMetric(
    'summaryLog.submission.duration',
    durationMs,
    Unit.Milliseconds
  )
}

export const summaryLogMetrics = {
  recordStatusTransition,
  recordWasteRecordsCreated,
  recordWasteRecordsUpdated,
  recordValidationDuration,
  recordSubmissionDuration
}
