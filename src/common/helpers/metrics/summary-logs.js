import { Unit } from 'aws-embedded-metrics'

import { metricsCounter } from '#common/helpers/metrics.js'

/**
 * Records a summary log status transition metric
 * @param {string} status - The status transitioned to
 */
async function recordStatusTransition(status) {
  await metricsCounter(`summaryLog.status.${status}`)
}

/**
 * Records the count of waste records created during submission
 * @param {number} count - The number of records created
 */
async function recordWasteRecordsCreated(count) {
  await metricsCounter('summaryLog.wasteRecords.created', count)
}

/**
 * Records the count of waste records updated during submission
 * @param {number} count - The number of records updated
 */
async function recordWasteRecordsUpdated(count) {
  await metricsCounter('summaryLog.wasteRecords.updated', count)
}

/**
 * Records the duration of validation processing
 * @param {number} durationMs - The duration in milliseconds
 */
async function recordValidationDuration(durationMs) {
  await metricsCounter(
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
  await metricsCounter(
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
