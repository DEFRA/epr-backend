import { incrementCounter, timed } from '#common/helpers/metrics.js'

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
 * Executes a function and records its duration as the validation metric
 * @template T
 * @param {() => Promise<T> | T} fn - The function to execute
 * @returns {Promise<T>} The result of the function
 */
async function timedValidation(fn) {
  return timed('summaryLog.validation.duration', fn)
}

/**
 * Executes a function and records its duration as the submission metric
 * @template T
 * @param {() => Promise<T> | T} fn - The function to execute
 * @returns {Promise<T>} The result of the function
 */
async function timedSubmission(fn) {
  return timed('summaryLog.submission.duration', fn)
}

export const summaryLogMetrics = {
  recordStatusTransition,
  recordWasteRecordsCreated,
  recordWasteRecordsUpdated,
  timedValidation,
  timedSubmission
}
