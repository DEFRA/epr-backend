import {
  incrementCounter,
  recordDuration,
  timed
} from '#common/helpers/metrics.js'

/**
 * @typedef {'REPROCESSOR_INPUT'|'REPROCESSOR_OUTPUT'|'EXPORTER'} ProcessingType
 * @typedef {string} SummaryLogStatus
 * @typedef {'fatal'|'error'|'warning'} ValidationSeverity
 * @typedef {'technical'|'business'} ValidationCategory
 * @typedef {'REJECTED'|'EXCLUDED'|'INCLUDED'} RowOutcome
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
 * Records a validation issue metric
 * @param {ValidationSeverity} severity - The severity of the issue
 * @param {ValidationCategory} category - The category of the issue
 * @param {ProcessingType} processingType - The processing type
 * @param {number} count - The number of issues
 */
async function recordValidationIssues(
  severity,
  category,
  processingType,
  count
) {
  await incrementCounter(
    'summaryLog.validation.issues',
    {
      severity: toDimension(severity),
      category: toDimension(category),
      processingType: toDimension(processingType)
    },
    count
  )
}

/**
 * Records a row outcome metric
 * @param {RowOutcome} outcome - The row classification outcome
 * @param {ProcessingType} processingType - The processing type
 * @param {number} count - The number of rows
 */
async function recordRowOutcome(outcome, processingType, count) {
  await incrementCounter(
    'summaryLog.rows.outcome',
    {
      outcome: toDimension(outcome),
      processingType: toDimension(processingType)
    },
    count
  )
}

/**
 * @typedef {Object} SummaryLogMetrics
 * @property {(status: SummaryLogStatus, processingType?: ProcessingType) => Promise<void>} recordStatusTransition - Records a status transition metric
 * @property {(processingType: ProcessingType, count: number) => Promise<void>} recordWasteRecordsCreated - Records count of waste records created
 * @property {(processingType: ProcessingType, count: number) => Promise<void>} recordWasteRecordsUpdated - Records count of waste records updated
 * @property {(processingType: ProcessingType, durationMs: number) => Promise<void>} recordValidationDuration - Records validation duration metric
 * @property {<T>(processingType: ProcessingType, fn: () => Promise<T> | T) => Promise<T>} timedSubmission - Executes function and records submission duration
 * @property {(severity: ValidationSeverity, category: ValidationCategory, processingType: ProcessingType, count: number) => Promise<void>} recordValidationIssues - Records validation issues metric
 * @property {(outcome: RowOutcome, processingType: ProcessingType, count: number) => Promise<void>} recordRowOutcome - Records row outcome metric
 */

/** @type {SummaryLogMetrics} */
export const summaryLogMetrics = {
  recordStatusTransition,
  recordWasteRecordsCreated,
  recordWasteRecordsUpdated,
  recordValidationDuration,
  timedSubmission,
  recordValidationIssues,
  recordRowOutcome
}
