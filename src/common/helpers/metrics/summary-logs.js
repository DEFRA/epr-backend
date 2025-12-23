import { incrementCounter, timed } from '#common/helpers/metrics.js'

/**
 * Records a summary log status transition metric
 * @param {string} status - The status transitioned to
 */
async function recordStatusTransition(status) {
  await incrementCounter('summaryLog.statusTransition', { status })
}

/**
 * Records the count of waste records created during submission
 * @param {number} count - The number of records created
 */
async function recordWasteRecordsCreated(count) {
  await incrementCounter(
    'summaryLog.wasteRecords',
    { operation: 'created' },
    count
  )
}

/**
 * Records the count of waste records updated during submission
 * @param {number} count - The number of records updated
 */
async function recordWasteRecordsUpdated(count) {
  await incrementCounter(
    'summaryLog.wasteRecords',
    { operation: 'updated' },
    count
  )
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

/**
 * @typedef {Object} SummaryLogMetrics
 * @property {(status: string) => Promise<void>} recordStatusTransition - Records a status transition metric
 * @property {(count: number) => Promise<void>} recordWasteRecordsCreated - Records count of waste records created
 * @property {(count: number) => Promise<void>} recordWasteRecordsUpdated - Records count of waste records updated
 * @property {<T>(fn: () => Promise<T> | T) => Promise<T>} timedValidation - Executes function and records validation duration
 * @property {<T>(fn: () => Promise<T> | T) => Promise<T>} timedSubmission - Executes function and records submission duration
 */

/** @type {SummaryLogMetrics} */
export const summaryLogMetrics = {
  recordStatusTransition,
  recordWasteRecordsCreated,
  recordWasteRecordsUpdated,
  timedValidation,
  timedSubmission
}
