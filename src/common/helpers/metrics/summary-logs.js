import { incrementCounter, recordDuration } from '#common/helpers/metrics.js'

/**
 * Records a summary log status transition metric
 * @param {string} status - The status transitioned to
 */
async function recordStatusTransition(status) {
  await incrementCounter(`summaryLog.status.${status}`)
}

/**
 * Records the count of waste records created during submission
 * @param {number} count - The number of records created
 */
async function recordWasteRecordsCreated(count) {
  await incrementCounter('summaryLog.wasteRecords.created', count)
}

/**
 * Records the count of waste records updated during submission
 * @param {number} count - The number of records updated
 */
async function recordWasteRecordsUpdated(count) {
  await incrementCounter('summaryLog.wasteRecords.updated', count)
}

/**
 * Records the duration of validation processing
 * @param {number} durationMs - The duration in milliseconds
 */
async function recordValidationDuration(durationMs) {
  await recordDuration('summaryLog.validation.duration', durationMs)
}

/**
 * Records the duration of submission processing
 * @param {number} durationMs - The duration in milliseconds
 */
async function recordSubmissionDuration(durationMs) {
  await recordDuration('summaryLog.submission.duration', durationMs)
}

export const summaryLogMetrics = {
  recordStatusTransition,
  recordWasteRecordsCreated,
  recordWasteRecordsUpdated,
  recordValidationDuration,
  recordSubmissionDuration
}
