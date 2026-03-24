import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'
import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { createValidationIssues } from '#common/validation/validation-issues.js'
import { SpreadsheetValidationError } from '#adapters/parsers/summary-logs/exceljs-parser.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

import { validateMetaSyntax } from './validations/meta-syntax.js'
import { validateMetaBusiness } from './validations/meta-business.js'
import { createDataSyntaxValidator } from './validations/data-syntax.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import {
  PROCESSING_TYPE_TABLES,
  findSchemaForProcessingType
} from '#domain/summary-logs/table-schemas/index.js'
import { validateDataBusiness } from './validations/data-business.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { transformFromSummaryLog } from '#application/waste-records/transform-from-summary-log.js'
import {
  countByWasteBalanceInclusion,
  countByValidity,
  countByWasteRecordType,
  mergeLoads
} from './load-counts.js'

export const MAX_VALIDATION_ISSUES = 100
export const MAX_ACTUAL_LENGTH = 200

/** @import {Registration} from '#domain/organisations/registration.js' */
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */
/** @typedef {import('#domain/summary-logs/status.js').SummaryLogStatus} SummaryLogStatus */
/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/waste-records/port.js').WasteRecordsRepository} WasteRecordsRepository */
/** @typedef {import('./extractor.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord */
/** @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue */

/** @typedef {import('#application/waste-records/transform-from-summary-log.js').ValidatedWasteRecord} ValidatedWasteRecord */

const extractSummaryLog = async ({
  summaryLogExtractor,
  summaryLog,
  loggingContext
}) => {
  const parsed = await summaryLogExtractor.extract(summaryLog)

  logger.info({
    message: `Extracted summary log file: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return parsed
}

const transformAndValidateData = async ({
  summaryLogId,
  summaryLog,
  validatedData,
  wasteRecordsRepository
}) => {
  // Fetch existing records and build lookup map for transformation
  const existingWasteRecords = await wasteRecordsRepository.findByRegistration(
    summaryLog.organisationId,
    summaryLog.registrationId
  )

  const existingRecordsMap = new Map(
    existingWasteRecords.map((record) => [
      `${record.type}:${record.rowId}`,
      record
    ])
  )

  // Transform validated rows into waste records (issues flow through)
  // Timestamp is required but won't be persisted during validation
  /** @type {ValidatedWasteRecord[]} */
  const wasteRecords = transformFromSummaryLog(
    validatedData,
    {
      summaryLog: {
        id: summaryLogId,
        uri: summaryLog.file.uri
      },
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      accreditationId: summaryLog.accreditationId,
      timestamp: new Date().toISOString()
    },
    existingRecordsMap
  )

  // Data business validation using waste records
  const issues = validateDataBusiness({ wasteRecords, existingWasteRecords })

  return { wasteRecords, issues }
}

const fetchRegistration = async ({
  organisationsRepository,
  organisationId,
  registrationId,
  loggingContext
}) => {
  const registration = await organisationsRepository.findRegistrationById(
    organisationId,
    registrationId
  )

  logger.info({
    message: `Fetched registration: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return registration
}

/**
 * @typedef {Object.<string, *>} ExtractedMeta
 * Metadata values extracted from parsed summary log (key: field name, value: field value)
 */

/**
 * @typedef {Object} ValidationResult
 * @property {ReturnType<typeof createValidationIssues>} issues - Validation issues object with methods like getAllIssues(), isFatal()
 * @property {ValidatedWasteRecord[]|null} wasteRecords - Waste records with validation issues (null if transformation not reached)
 * @property {ExtractedMeta} [meta] - Extracted metadata values (only present after successful extraction)
 */

/**
 * Performs all validation checks on a summary log
 *
 * Implements a four-level short-circuit validation strategy:
 *
 * Level 1: Meta Syntax (FATAL)
 *   - Validates structural correctness of meta fields
 *   - Stops on fatal errors
 *
 * Level 2: Meta Business (FATAL/ERROR)
 *   - Validates meta fields against registration business rules
 *   - Stops on fatal errors
 *
 * Level 3: Data Syntax (ERROR/WARNING)
 *   - Validates structural correctness of data table rows
 *   - Attaches issues directly to rows for downstream processing
 *   - Continues even with errors (non-fatal)
 *
 * Level 4: Transform & Data Business (FATAL/ERROR/WARNING)
 *   - Transforms validated rows into waste records with issues attached
 *   - Sequential row validation: ensures no rows removed from previous uploads
 *   - Stops on fatal errors
 *
 * This approach provides:
 * - Better performance (stops early on fatal errors)
 * - Clearer user feedback (fixes meta issues before seeing data errors)
 * - Reduced noise in validation output
 * - Logical separation between meta and data validation phases
 * - Issues flow with data through transformation (no re-correlation needed)
 *
 * Converts any exceptions to fatal technical issues.
 *
 * @param {Object} params
 * @param {string} params.summaryLogId - The summary log ID
 * @param {SummaryLog} params.summaryLog - The summary log to validate
 * @param {string} params.loggingContext - Context string for logging (e.g., "summaryLogId=123, fileId=456")
 * @param {SummaryLogExtractor} params.summaryLogExtractor - Extractor service for parsing the file
 * @param {OrganisationsRepository} params.organisationsRepository - Organisation repository for fetching registration data
 * @param {WasteRecordsRepository} params.wasteRecordsRepository - Waste records repository for fetching existing records
 * @param {Function} params.validateDataSyntax - Data syntax validator function
 * @returns {Promise<ValidationResult>} Validation result with issues and transformed records
 */
/**
 * Extracts just the values from parsed metadata entries
 * @param {Object<string, {value: *}>} parsedMeta - Parsed metadata with value/location objects
 * @returns {ExtractedMeta} Object with field names mapped to their values
 */
const extractMetaValues = (parsedMeta) => {
  return Object.fromEntries(
    Object.entries(parsedMeta)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, entry.value])
  )
}

const handleValidationFailure = (error, issues, loggingContext) => {
  if (error instanceof SpreadsheetValidationError) {
    logger.warn({
      err: error,
      message: `Invalid summary log file: ${loggingContext}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    issues.addFatal(VALIDATION_CATEGORY.TECHNICAL, error.message, error.code)
  } else {
    logger.error({
      err: error,
      message: `Failed to validate summary log file: ${loggingContext}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    issues.addFatal(
      VALIDATION_CATEGORY.TECHNICAL,
      error.message,
      VALIDATION_CODE.VALIDATION_SYSTEM_ERROR
    )
  }
}

const markIgnoredByDateRange = (
  /** @type ValidatedWasteRecord[] */ wasteRecords,
  /** @type Registration */ registration,
  /** @type string */ processingType
) => {
  for (const wasteRecord of wasteRecords) {
    const schema = findSchemaForProcessingType(
      processingType,
      wasteRecord.record.type
    )

    /** @type {import('#domain/summary-logs/table-schemas/validation-pipeline.js').WasteBalanceClassificationResult | undefined} */
    const result = schema?.classifyForWasteBalance?.(wasteRecord.record.data, {
      accreditation: registration.accreditation ?? null
    })

    if (result?.outcome === ROW_OUTCOME.IGNORED) {
      wasteRecord.outcome = ROW_OUTCOME.IGNORED
    }
  }
}

const performValidationChecks = async ({
  summaryLogId,
  summaryLog,
  loggingContext,
  summaryLogExtractor,
  organisationsRepository,
  wasteRecordsRepository,
  validateDataSyntax,
  featureFlags
}) => {
  const issues = createValidationIssues()
  let wasteRecords = null
  let meta

  try {
    const parsed = await extractSummaryLog({
      summaryLogExtractor,
      summaryLog,
      loggingContext
    })

    meta = extractMetaValues(parsed.meta)

    issues.merge(validateMetaSyntax({ parsed, featureFlags }))

    if (issues.isFatal()) {
      return { issues, wasteRecords, meta }
    }

    const registration = await fetchRegistration({
      organisationsRepository,
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      loggingContext
    })

    issues.merge(
      validateMetaBusiness({
        parsed,
        registration,
        loggingContext,
        featureFlags
      })
    )

    if (issues.isFatal()) {
      return { issues, wasteRecords, meta }
    }

    // Data syntax validation returns validated data with issues attached to rows
    const { issues: dataSyntaxIssues, validatedData } =
      validateDataSyntax(parsed)
    issues.merge(dataSyntaxIssues)

    if (issues.isFatal()) {
      return { issues, wasteRecords, meta }
    }

    const dataResult = await transformAndValidateData({
      summaryLogId,
      summaryLog,
      validatedData,
      wasteRecordsRepository
    })

    wasteRecords = dataResult.wasteRecords

    markIgnoredByDateRange(wasteRecords, registration, meta.PROCESSING_TYPE)

    issues.merge(dataResult.issues)
  } catch (error) {
    handleValidationFailure(error, issues, loggingContext)
  }

  return { issues, wasteRecords, meta }
}

/**
 * Records validation issue metrics grouped by severity × category
 *
 * @param {ReturnType<typeof createValidationIssues>} issues - Validation issues object
 * @param {string} processingType - The processing type for the metric dimension
 */
const recordValidationIssueMetrics = async (issues, processingType) => {
  const allIssues = issues.getAllIssues()
  if (allIssues.length === 0) {
    return
  }

  // Count issues by severity × category
  const counts = new Map()
  for (const issue of allIssues) {
    const key = `${issue.severity}:${issue.category}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  // Record metrics for each combination
  for (const [key, count] of counts) {
    const [severity, category] = key.split(':')
    await summaryLogMetrics.recordValidationIssues(
      {
        severity:
          /** @type {import('#common/helpers/metrics/summary-logs.js').ValidationSeverity} */ (
            severity
          ),
        category:
          /** @type {import('#common/helpers/metrics/summary-logs.js').ValidationCategory} */ (
            category
          ),
        processingType:
          /** @type {import('#common/helpers/metrics/summary-logs.js').ProcessingType} */ (
            processingType
          )
      },
      count
    )
  }
}

/**
 * Records row outcome metrics grouped by outcome
 *
 * @param {ValidatedWasteRecord[] | null} wasteRecords - Waste records with outcomes
 * @param {string} processingType - The processing type for the metric dimension
 */
const recordRowOutcomeMetrics = async (wasteRecords, processingType) => {
  if (!wasteRecords || wasteRecords.length === 0) {
    return
  }

  // Count by outcome
  const counts = {
    [ROW_OUTCOME.INCLUDED]: 0,
    [ROW_OUTCOME.EXCLUDED]: 0,
    [ROW_OUTCOME.REJECTED]: 0,
    [ROW_OUTCOME.IGNORED]: 0
  }

  for (const { outcome } of wasteRecords) {
    counts[outcome]++
  }

  // Record metrics for each outcome with non-zero count
  for (const [outcome, count] of Object.entries(counts)) {
    if (count > 0) {
      await summaryLogMetrics.recordRowOutcome(
        {
          outcome:
            /** @type {import('#common/helpers/metrics/summary-logs.js').RowOutcome} */ (
              outcome
            ),
          processingType:
            /** @type {import('#common/helpers/metrics/summary-logs.js').ProcessingType} */ (
              processingType
            )
        },
        count
      )
    }
  }
}

/**
 * Creates a summary logs validator function
 *
 * @param {Object} params
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {WasteRecordsRepository} params.wasteRecordsRepository
 * @param {SummaryLogExtractor} params.summaryLogExtractor
 */
const assertValidatingStatus = (result, summaryLogId) => {
  if (!result) {
    throw new PermanentError(
      `Summary log not found: summaryLogId=${summaryLogId}`
    )
  }

  if (result.summaryLog.status !== SUMMARY_LOG_STATUS.VALIDATING) {
    throw new PermanentError(
      `Summary log must be in validating status. Current status: ${result.summaryLog.status}`
    )
  }
}

/**
 * Records all validation-related metrics.
 *
 * @param {Object} params
 * @param {ReturnType<typeof createValidationIssues>} params.issues
 * @param {string} params.processingType
 * @param {SummaryLogStatus} params.status
 * @param {number} params.validationDurationMs
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords
 */
const recordValidationMetrics = async ({
  issues,
  processingType,
  status,
  validationDurationMs,
  wasteBalanceRecords
}) => {
  await summaryLogMetrics.recordValidationDuration(
    { processingType },
    validationDurationMs
  )
  await summaryLogMetrics.recordStatusTransition({ status, processingType })
  await recordValidationIssueMetrics(issues, processingType)
  await recordRowOutcomeMetrics(wasteBalanceRecords, processingType)
}

/**
 * Persists the validation result to the summary log document.
 *
 * @param {Object} params
 * @param {ReturnType<typeof createValidationIssues>} params.issues
 * @param {object | null} params.loads
 * @param {Array | null} params.loadsByWasteRecordType
 * @param {ExtractedMeta} params.meta
 * @param {string} params.status
 * @param {SummaryLog} params.summaryLog
 * @param {string} params.summaryLogId
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {number} params.version
 */
const persistValidationResult = async ({
  issues,
  loads,
  loadsByWasteRecordType,
  meta,
  status,
  summaryLog,
  summaryLogId,
  summaryLogsRepository,
  version
}) => {
  const allIssues = issues.getAllIssues()
  const { cappedIssues, totalIssuesCount } = capIssuesForStorage(allIssues)

  await summaryLogsRepository.update(summaryLogId, version, {
    ...transitionStatus(summaryLog, status),
    validation: {
      issues: cappedIssues,
      totalIssuesCount
    },
    ...(loads && { loads }),
    ...(loadsByWasteRecordType && { loadsByWasteRecordType }),
    ...(meta && { meta })
  })
}

/**
 * Filters waste records to only those from tables that participate in waste balance.
 *
 * @param {ValidatedWasteRecord[] | null} wasteRecords
 * @param {string} processingType
 * @returns {ValidatedWasteRecord[]}
 */
const filterWasteBalanceRecords = (wasteRecords, processingType) =>
  wasteRecords?.filter((wr) => {
    const schema = findSchemaForProcessingType(processingType, wr.record.type)
    return schema?.classifyForWasteBalance != null
  }) ?? []

/**
 * Computes aggregate and per-waste-record-type load counts for validated summary logs.
 *
 * @param {Object} params
 * @param {string} params.status - Summary log status after validation
 * @param {ValidatedWasteRecord[]} params.wasteRecords - All waste records
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords - Waste-balance-eligible records
 * @param {string} params.summaryLogId
 * @param {string} params.processingType
 * @returns {{ loads: Loads | null, loadsByWasteRecordType: Array | null }}
 */
const classifyLoads = ({
  processingType,
  status,
  summaryLogId,
  wasteBalanceRecords,
  wasteRecords
}) => {
  if (status !== SUMMARY_LOG_STATUS.VALIDATED || !wasteRecords) {
    return { loads: null, loadsByWasteRecordType: null }
  }

  const loads = mergeLoads(
    countByValidity({ wasteRecords, summaryLogId }),
    countByWasteBalanceInclusion({
      wasteRecords: wasteBalanceRecords,
      summaryLogId
    })
  )

  const tableSchemas = PROCESSING_TYPE_TABLES[processingType]

  const loadsByWasteRecordType = countByWasteRecordType({
    wasteRecords,
    wasteBalanceRecords,
    summaryLogId,
    tableSchemas
  })

  return { loads, loadsByWasteRecordType }
}

export const createSummaryLogsValidator = ({
  summaryLogsRepository,
  organisationsRepository,
  wasteRecordsRepository,
  summaryLogExtractor,
  featureFlags
}) => {
  const validateDataSyntax = createDataSyntaxValidator(PROCESSING_TYPE_TABLES)

  return async (summaryLogId) => {
    const result = await summaryLogsRepository.findById(summaryLogId)
    assertValidatingStatus(result, summaryLogId)

    const { version, summaryLog } = result
    const {
      file: { id: fileId, name: filename }
    } = summaryLog

    const loggingContext = `summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}`

    logger.info({
      message: `Summary log validation started: ${loggingContext}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    const validationStart = Date.now()
    const { issues, wasteRecords, meta } = await performValidationChecks({
      summaryLogId,
      summaryLog,
      loggingContext,
      summaryLogExtractor,
      organisationsRepository,
      wasteRecordsRepository,
      validateDataSyntax,
      featureFlags
    })
    const validationDurationMs = Date.now() - validationStart

    const processingType = meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]

    const status = issues.isFatal()
      ? SUMMARY_LOG_STATUS.INVALID
      : SUMMARY_LOG_STATUS.VALIDATED

    const wasteBalanceRecords = filterWasteBalanceRecords(
      wasteRecords,
      processingType
    )

    await recordValidationMetrics({
      issues,
      processingType,
      status,
      validationDurationMs,
      wasteBalanceRecords
    })

    const { loads, loadsByWasteRecordType } = classifyLoads({
      processingType,
      status,
      summaryLogId,
      wasteBalanceRecords,
      wasteRecords
    })

    await persistValidationResult({
      issues,
      loads,
      loadsByWasteRecordType,
      meta,
      status,
      summaryLog,
      summaryLogId,
      summaryLogsRepository,
      version
    })

    logger.info({
      message: `Summary log updated: ${loggingContext}, status=${status}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  }
}

/**
 * Caps the issues array and truncates long actual values for MongoDB storage.
 *
 * Both the issue count and per-issue actual values are bounded to prevent
 * the summary log document exceeding MongoDB's 16 MiB BSON limit.
 * @see https://eaflood.atlassian.net/browse/PAE-1244
 *
 * @param {ValidationIssue[]} allIssues - All validation issues
 * @returns {{ cappedIssues: ValidationIssue[], totalIssuesCount: number }}
 */
const capIssuesForStorage = (allIssues) => {
  const shouldTruncate = allIssues.length > MAX_VALIDATION_ISSUES
  const issues = shouldTruncate
    ? allIssues.slice(0, MAX_VALIDATION_ISSUES)
    : allIssues

  for (const issue of issues) {
    if (
      typeof issue.context?.actual === 'string' &&
      issue.context.actual.length > MAX_ACTUAL_LENGTH
    ) {
      issue.context.actual =
        issue.context.actual.slice(0, MAX_ACTUAL_LENGTH) + '…'
    }
  }

  return {
    cappedIssues: issues,
    totalIssuesCount: allIssues.length
  }
}
