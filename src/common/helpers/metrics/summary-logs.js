import {
  incrementCounter,
  recordDuration,
  timed
} from '#common/helpers/metrics.js'

/**
 * @typedef {'REPROCESSOR_INPUT'|'REPROCESSOR_OUTPUT'|'EXPORTER'} ProcessingType
 * @typedef {string} SummaryLogStatus
 */

/**
 * Maps enum values to lowercase dimension values
 * @param {ProcessingType|null|undefined} value
 * @returns {string|undefined}
 */
const toDimension = (value) => value?.toLowerCase()

/**
 * Records a summary log status transition metric
 * @param {SummaryLogStatus} status - The status transitioned to
 * @param {ProcessingType} [processingType] - Optional for early lifecycle states
 */
async function recordStatusTransition(status, processingType) {
  const dimensions = { status }
  const processingTypeDimension = toDimension(processingType)
  if (processingTypeDimension) {
    dimensions.processingType = processingTypeDimension
  }
  await incrementCounter('summaryLog.statusTransition', dimensions)
}

/**
 * Records the count of waste records created during submission
 * @param {ProcessingType} processingType
 * @param {number} count - The number of records created
 */
async function recordWasteRecordsCreated(processingType, count) {
  await incrementCounter(
    'summaryLog.wasteRecords',
    { operation: 'created', processingType: toDimension(processingType) },
    count
  )
}

/**
 * Records the count of waste records updated during submission
 * @param {ProcessingType} processingType
 * @param {number} count - The number of records updated
 */
async function recordWasteRecordsUpdated(processingType, count) {
  await incrementCounter(
    'summaryLog.wasteRecords',
    { operation: 'updated', processingType: toDimension(processingType) },
    count
  )
}

/**
 * Records the duration of a validation operation
 * @param {ProcessingType} processingType
 * @param {number} durationMs - The duration in milliseconds
 */
async function recordValidationDuration(processingType, durationMs) {
  await recordDuration(
    'summaryLog.validation.duration',
    { processingType: toDimension(processingType) },
    durationMs
  )
}

/**
 * Executes a function and records its duration as the submission metric
 * @template T
 * @param {ProcessingType} processingType
 * @param {() => Promise<T> | T} fn - The function to execute
 * @returns {Promise<T>} The result of the function
 */
async function timedSubmission(processingType, fn) {
  return timed(
    'summaryLog.submission.duration',
    {
      processingType: toDimension(processingType)
    },
    fn
  )
}

/**
 * @typedef {Object} SummaryLogMetrics
 * @property {(status: SummaryLogStatus, processingType?: ProcessingType) => Promise<void>} recordStatusTransition - Records a status transition metric
 * @property {(processingType: ProcessingType, count: number) => Promise<void>} recordWasteRecordsCreated - Records count of waste records created
 * @property {(processingType: ProcessingType, count: number) => Promise<void>} recordWasteRecordsUpdated - Records count of waste records updated
 * @property {(processingType: ProcessingType, durationMs: number) => Promise<void>} recordValidationDuration - Records validation duration metric
 * @property {<T>(processingType: ProcessingType, fn: () => Promise<T> | T) => Promise<T>} timedSubmission - Executes function and records submission duration
 */

/** @type {SummaryLogMetrics} */
export const summaryLogMetrics = {
  recordStatusTransition,
  recordWasteRecordsCreated,
  recordWasteRecordsUpdated,
  recordValidationDuration,
  timedSubmission
}
