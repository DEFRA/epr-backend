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
 * @typedef {Object} StatusTransitionDimensions
 * @property {SummaryLogStatus} status
 * @property {ProcessingType} [processingType]
 */

/**
 * @typedef {Object} ProcessingTypeDimensions
 * @property {ProcessingType} processingType
 */

/**
 * @typedef {Object} ValidationIssueDimensions
 * @property {ValidationSeverity} severity
 * @property {ValidationCategory} category
 * @property {ProcessingType} processingType
 */

/**
 * @typedef {Object} RowOutcomeDimensions
 * @property {RowOutcome} outcome
 * @property {ProcessingType} processingType
 */

/**
 * Maps enum values to lowercase dimension values
 * @param {string|null|undefined} value
 * @returns {string|undefined}
 */
const toDimension = (value) => value?.toLowerCase()

/**
 * Builds CloudWatch dimensions object, converting values to lowercase
 * and omitting undefined values
 * @param {Record<string, string|undefined>} dimensions
 * @returns {Record<string, string>}
 */
const buildDimensions = (dimensions) => {
  /** @type {Record<string, string>} */
  const result = {}
  for (const [key, value] of Object.entries(dimensions)) {
    const dimensionValue = toDimension(value)
    if (dimensionValue) {
      result[key] = dimensionValue
    }
  }
  return result
}

/**
 * Records a summary log status transition metric
 * @param {StatusTransitionDimensions} dimensions
 */
async function recordStatusTransition({ status, processingType }) {
  await incrementCounter(
    'summaryLog.statusTransition',
    buildDimensions({ status, processingType })
  )
}

/**
 * Records the count of waste records created during submission
 * @param {ProcessingTypeDimensions} dimensions
 * @param {number} count - The number of records created
 */
async function recordWasteRecordsCreated({ processingType }, count) {
  await incrementCounter(
    'summaryLog.wasteRecords',
    buildDimensions({ operation: 'created', processingType }),
    count
  )
}

/**
 * Records the count of waste records updated during submission
 * @param {ProcessingTypeDimensions} dimensions
 * @param {number} count - The number of records updated
 */
async function recordWasteRecordsUpdated({ processingType }, count) {
  await incrementCounter(
    'summaryLog.wasteRecords',
    buildDimensions({ operation: 'updated', processingType }),
    count
  )
}

/**
 * Records the duration of a validation operation
 * @param {ProcessingTypeDimensions} dimensions
 * @param {number} durationMs - The duration in milliseconds
 */
async function recordValidationDuration({ processingType }, durationMs) {
  await recordDuration(
    'summaryLog.validation.duration',
    buildDimensions({ processingType }),
    durationMs
  )
}

/**
 * Executes a function and records its duration as the submission metric
 * @template T
 * @param {ProcessingTypeDimensions} dimensions
 * @param {() => Promise<T> | T} fn - The function to execute
 * @returns {Promise<T>} The result of the function
 */
async function timedSubmission({ processingType }, fn) {
  return timed(
    'summaryLog.submission.duration',
    buildDimensions({ processingType }),
    fn
  )
}

/**
 * Records a validation issue metric
 * @param {ValidationIssueDimensions} dimensions
 * @param {number} count - The number of issues
 */
async function recordValidationIssues(
  { severity, category, processingType },
  count
) {
  await incrementCounter(
    'summaryLog.validation.issues',
    buildDimensions({ severity, category, processingType }),
    count
  )
}

/**
 * Records a row outcome metric
 * @param {RowOutcomeDimensions} dimensions
 * @param {number} count - The number of rows
 */
async function recordRowOutcome({ outcome, processingType }, count) {
  await incrementCounter(
    'summaryLog.rows.outcome',
    buildDimensions({ outcome, processingType }),
    count
  )
}

/**
 * @typedef {Object} SummaryLogMetrics
 * @property {(dimensions: StatusTransitionDimensions) => Promise<void>} recordStatusTransition - Records a status transition metric
 * @property {(dimensions: ProcessingTypeDimensions, count: number) => Promise<void>} recordWasteRecordsCreated - Records count of waste records created
 * @property {(dimensions: ProcessingTypeDimensions, count: number) => Promise<void>} recordWasteRecordsUpdated - Records count of waste records updated
 * @property {(dimensions: ProcessingTypeDimensions, durationMs: number) => Promise<void>} recordValidationDuration - Records validation duration metric
 * @property {<T>(dimensions: ProcessingTypeDimensions, fn: () => Promise<T> | T) => Promise<T>} timedSubmission - Executes function and records submission duration
 * @property {(dimensions: ValidationIssueDimensions, count: number) => Promise<void>} recordValidationIssues - Records validation issues metric
 * @property {(dimensions: RowOutcomeDimensions, count: number) => Promise<void>} recordRowOutcome - Records row outcome metric
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
