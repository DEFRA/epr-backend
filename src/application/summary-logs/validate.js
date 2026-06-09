import { SpreadsheetValidationError } from '#adapters/parsers/summary-logs/exceljs-parser.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/index.js'
import { isNil } from '#common/helpers/is-nil.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'
import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

import { transformFromSummaryLog } from '#application/waste-records/transform-from-summary-log.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import {
  PROCESSING_TYPE_TABLES,
  findSchemaForProcessingType
} from '#domain/summary-logs/table-schemas/index.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import {
  countByValidity,
  countByWasteBalanceInclusion,
  countByWasteRecordType,
  mergeLoads
} from './load-counts.js'
import { classifyByPeriodStatus } from './period-status.js'
import {
  logValidationIssues,
  MAX_VALIDATION_ISSUES
} from './validate-issue-logging.js'
import { validateDataBusiness } from './validations/data-business.js'
import { createDataSyntaxValidator } from './validations/data-syntax.js'
import { validateMetaBusiness } from './validations/meta-business.js'
import { validateMetaSyntax } from './validations/meta-syntax.js'

export { MAX_VALIDATION_ISSUES }

export const MAX_ACTUAL_LENGTH = 200

/** @import {ValidatedSummaryLog, ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {ValidationIssue, ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {ParsedSummaryLog} from '#domain/summary-logs/extractor/port.js' */
/** @import {ProcessingType} from '#domain/summary-logs/meta-fields.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */
/** @import {SummaryLogStatus} from '#domain/summary-logs/status.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {WasteRecordsRepository} from '#repositories/waste-records/port.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {SummaryLogExtractor} from './extractor.js' */
/** @import {Loads} from './load-counts.js' */
/** @import {LoadsByPeriodStatus} from './period-status.js' */
/** @import {ReportsRepository} from '#reports/repository/port.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */

/**
 * @param {{
 *   summaryLogExtractor: SummaryLogExtractor,
 *   summaryLog: SummaryLog,
 *   loggingContext: string,
 *   logger: TypedLogger
 * }} params
 * @returns {Promise<ParsedSummaryLog>}
 */
const extractSummaryLog = async ({
  summaryLogExtractor,
  summaryLog,
  loggingContext,
  logger
}) => {
  const parsed = await summaryLogExtractor.extract(summaryLog, { logger })

  logger.info({
    message: `Extracted summary log file: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return parsed
}

/**
 * @param {{
 *   summaryLogId: string,
 *   summaryLog: SubmittedSummaryLog,
 *   validatedData: ValidatedSummaryLog,
 *   wasteRecordsRepository: WasteRecordsRepository
 * }} params
 * @returns {Promise<{
 *   wasteRecords: ValidatedWasteRecord[],
 *   existingRecordsMap: Map<string, WasteRecord>,
 *   issues: ValidationIssuesCollector
 * }>}
 */
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

  return { wasteRecords, existingRecordsMap, issues }
}

/**
 * @param {{
 *   organisationsRepository: OrganisationsRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   loggingContext: string,
 *   logger: TypedLogger
 * }} params
 * @returns {Promise<Registration>}
 */
const fetchRegistration = async ({
  organisationsRepository,
  organisationId,
  registrationId,
  loggingContext,
  logger
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
 * @property {ValidationIssuesCollector} issues - Validation issues object with methods like getAllIssues(), isFatal()
 * @property {ValidatedWasteRecord[]|null} wasteRecords - Waste records with validation issues (null if transformation not reached)
 * @property {ExtractedMeta} [meta] - Extracted metadata values (only present after successful extraction)
 * @property {Registration} [registration] - Registration fetched during validation
 * @property {Map<string, WasteRecord>} [existingRecordsMap] - Existing records map for adjusted record lookup
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

/**
 * @param {Error & { code?: string }} error
 * @param {ValidationIssuesCollector} issues
 * @param {string} loggingContext
 * @param {TypedLogger} logger
 */
const handleValidationFailure = (error, issues, loggingContext, logger) => {
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
      accreditation: registration.accreditation,
      overseasSites: ORS_VALIDATION_DISABLED
    })

    if (result?.outcome === ROW_OUTCOME.IGNORED) {
      wasteRecord.outcome = ROW_OUTCOME.IGNORED
    }
  }
}

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
 * Converts any exceptions to fatal technical issues.
 *
 * @param {{
 *   summaryLogId: string,
 *   summaryLog: SubmittedSummaryLog,
 *   loggingContext: string,
 *   logger: TypedLogger,
 *   summaryLogExtractor: SummaryLogExtractor,
 *   organisationsRepository: OrganisationsRepository,
 *   wasteRecordsRepository: WasteRecordsRepository,
 *   validateDataSyntax: (parsed: ParsedSummaryLog) => { issues: ValidationIssuesCollector, validatedData: ValidatedSummaryLog }
 * }} params
 * @returns {Promise<ValidationResult>}
 */
const performValidationChecks = async ({
  summaryLogId,
  summaryLog,
  loggingContext,
  logger,
  summaryLogExtractor,
  organisationsRepository,
  wasteRecordsRepository,
  validateDataSyntax
}) => {
  const issues = createValidationIssues()
  let wasteRecords = null
  /** @type {ExtractedMeta | undefined} */
  let meta
  /** @type {Registration | undefined} */
  let registration
  /** @type {Map<string, WasteRecord> | undefined} */
  let existingRecordsMap

  try {
    const parsed = await extractSummaryLog({
      summaryLogExtractor,
      summaryLog,
      loggingContext,
      logger
    })

    meta = extractMetaValues(parsed.meta)

    issues.merge(validateMetaSyntax({ parsed }))

    if (issues.isFatal()) {
      return { issues, wasteRecords, meta }
    }

    registration = await fetchRegistration({
      organisationsRepository,
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      loggingContext,
      logger
    })

    issues.merge(
      validateMetaBusiness({
        parsed,
        registration,
        loggingContext
      })
    )

    if (issues.isFatal()) {
      return { issues, wasteRecords, meta, registration }
    }

    // Data syntax validation returns validated data with issues attached to rows
    const { issues: dataSyntaxIssues, validatedData } =
      validateDataSyntax(parsed)
    issues.merge(dataSyntaxIssues)

    if (issues.isFatal()) {
      return { issues, wasteRecords, meta, registration }
    }

    const dataResult = await transformAndValidateData({
      summaryLogId,
      summaryLog,
      validatedData,
      wasteRecordsRepository
    })

    wasteRecords = dataResult.wasteRecords
    existingRecordsMap = dataResult.existingRecordsMap

    markIgnoredByDateRange(wasteRecords, registration, meta.PROCESSING_TYPE)

    issues.merge(dataResult.issues)
  } catch (error) {
    handleValidationFailure(
      /** @type {Error & { code?: string }} */ (error),
      issues,
      loggingContext,
      logger
    )
  }

  return { issues, wasteRecords, meta, registration, existingRecordsMap }
}

/**
 * Records validation issue metrics grouped by severity × category
 *
 * @param {ValidationIssuesCollector} issues - Validation issues object
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
        processingType: /** @type {ProcessingType} */ (processingType)
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
          processingType: /** @type {ProcessingType} */ (processingType)
        },
        count
      )
    }
  }
}

/**
 * @param {{ summaryLog: SummaryLog, version: number } | null | undefined} result
 * @param {string} summaryLogId
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
 * @param {ValidationIssuesCollector} params.issues
 * @param {ProcessingType} params.processingType
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
 * @param {ValidationIssuesCollector} params.issues
 * @param {Loads | null} params.loads
 * @param {LoadsByPeriodStatus | null} params.loadsByPeriodStatus
 * @param {import('./load-counts.js').LoadsByWasteRecordType | null} params.loadsByWasteRecordType
 * @param {ExtractedMeta | undefined} params.meta
 * @param {SummaryLogStatus} params.status
 * @param {SummaryLog} params.summaryLog
 * @param {string} params.summaryLogId
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {number} params.version
 */
const persistValidationResult = async ({
  issues,
  loads,
  loadsByPeriodStatus,
  loadsByWasteRecordType,
  meta,
  status,
  summaryLog,
  summaryLogId,
  summaryLogsRepository,
  version
}) => {
  const allIssues = issues.getAllIssues()
  const cappedIssues = capIssuesForStorage(allIssues)

  await summaryLogsRepository.update(summaryLogId, version, {
    ...transitionStatus(summaryLog, status),
    validation: {
      issues: cappedIssues,
      counts: issues.getCounts()
    },
    ...(loads && { loads }),
    ...(loadsByPeriodStatus && { loadsByPeriodStatus }),
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
    return !isNil(schema?.classifyForWasteBalance)
  }) ?? []

/**
 * Computes all load classifications for validated summary logs.
 *
 * @param {Object} params
 * @param {string} params.status - Summary log status after validation
 * @param {ValidatedWasteRecord[] | null} params.wasteRecords - All waste records
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords - Waste-balance-eligible records
 * @param {string} params.summaryLogId
 * @param {ProcessingType} params.processingType
 * @param {import('#reports/repository/port.js').PeriodicReport[] | null} params.periodicReports
 * @param {Registration} [params.registration]
 * @param {Map<string, WasteRecord>} [params.existingRecordsMap]
 * @returns {{ loads: Loads | null, loadsByWasteRecordType: import('./load-counts.js').LoadsByWasteRecordType | null, loadsByPeriodStatus: LoadsByPeriodStatus | null }}
 */
const classifyLoads = ({
  processingType,
  status,
  summaryLogId,
  wasteBalanceRecords,
  wasteRecords,
  periodicReports,
  registration,
  existingRecordsMap
}) => {
  if (status !== SUMMARY_LOG_STATUS.VALIDATED || !wasteRecords) {
    return { loads: null, loadsByWasteRecordType: null, loadsByPeriodStatus: null }
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

  const loadsByPeriodStatus =
    periodicReports && registration && existingRecordsMap && tableSchemas
      ? classifyByPeriodStatus({
          wasteRecords,
          existingRecordsMap,
          periodicReports,
          cadence: isRegistrationAccredited(registration)
            ? 'monthly'
            : 'quarterly',
          summaryLogId,
          tableSchemas,
          classificationContext: {
            accreditation: registration.accreditation ?? null,
            overseasSites: ORS_VALIDATION_DISABLED
          }
        })
      : null

  return { loads, loadsByWasteRecordType, loadsByPeriodStatus }
}

/**
 * Creates a summary logs validator function.
 *
 * @param {{
 *   logger: TypedLogger,
 *   summaryLogsRepository: SummaryLogsRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   wasteRecordsRepository: WasteRecordsRepository,
 *   reportsRepository: ReportsRepository,
 *   summaryLogExtractor: SummaryLogExtractor
 * }} params
 * @returns {(summaryLogId: string) => Promise<void>}
 */
export const createSummaryLogsValidator = ({
  logger,
  summaryLogsRepository,
  organisationsRepository,
  wasteRecordsRepository,
  reportsRepository,
  summaryLogExtractor
}) => {
  const validateDataSyntax = createDataSyntaxValidator(PROCESSING_TYPE_TABLES)

  return async (summaryLogId) => {
    const result = await summaryLogsRepository.findById(summaryLogId)
    assertValidatingStatus(result, summaryLogId)
    const { version, summaryLog } =
      /** @type {{ version: number, summaryLog: SubmittedSummaryLog }} */ (
        result
      )
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
    const {
      issues,
      wasteRecords,
      meta,
      registration,
      existingRecordsMap
    } = await performValidationChecks({
      summaryLogId,
      summaryLog,
      loggingContext,
      logger,
      summaryLogExtractor,
      organisationsRepository,
      wasteRecordsRepository,
      validateDataSyntax
    })
    const validationDurationMs = Date.now() - validationStart

    logValidationIssues({ summaryLogId, summaryLog, issues, logger })

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

    /** @type {import('#reports/repository/port.js').PeriodicReport[] | null} */
    let periodicReports = null
    try {
      if (registration && status === SUMMARY_LOG_STATUS.VALIDATED) {
        periodicReports = await reportsRepository.findPeriodicReports({
          organisationId: summaryLog.organisationId,
          registrationId: summaryLog.registrationId
        })
      }
    } catch (err) {
      logger.warn({
        message: `Failed to fetch periodic reports: ${loggingContext}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
        },
        err
      })
    }

    const { loads, loadsByWasteRecordType, loadsByPeriodStatus } = classifyLoads(
      {
        processingType,
        status,
        summaryLogId,
        wasteBalanceRecords,
        wasteRecords,
        periodicReports,
        registration,
        existingRecordsMap
      }
    )

    await persistValidationResult({
      issues,
      loads,
      loadsByPeriodStatus,
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

/** @param {ValidationIssue[]} issues */
const truncateActualValues = (issues) => {
  for (const issue of issues) {
    if (
      typeof issue.context?.actual === 'string' &&
      issue.context.actual.length > MAX_ACTUAL_LENGTH
    ) {
      issue.context.actual =
        issue.context.actual.slice(0, MAX_ACTUAL_LENGTH) + '…'
    }
  }
}

/**
 * Caps the issues array and truncates long actual values for MongoDB storage.
 *
 * Both the issue count and per-issue actual values are bounded to prevent
 * the summary log document exceeding MongoDB's 16 MiB BSON limit.
 * @see https://eaflood.atlassian.net/browse/PAE-1244
 *
 * Fatal issues are always preserved — they determine the summary log status
 * and are required by the frontend to render specific error messages.
 * Non-fatal issues fill the remaining capacity.
 *
 * @param {ValidationIssue[]} allIssues - All validation issues
 * @returns {ValidationIssue[]} The capped, actual-value-truncated issues
 */
const capIssuesForStorage = (allIssues) => {
  let cappedIssues

  if (allIssues.length <= MAX_VALIDATION_ISSUES) {
    cappedIssues = allIssues
  } else {
    const fatal = allIssues.filter(
      (issue) => issue.severity === VALIDATION_SEVERITY.FATAL
    )
    const nonFatal = allIssues.filter(
      (issue) => issue.severity !== VALIDATION_SEVERITY.FATAL
    )
    const cappedFatal = fatal.slice(0, MAX_VALIDATION_ISSUES)
    const nonFatalSlots = Math.max(
      0,
      MAX_VALIDATION_ISSUES - cappedFatal.length
    )
    cappedIssues = [...cappedFatal, ...nonFatal.slice(0, nonFatalSlots)]
  }

  truncateActualValues(cappedIssues)

  return cappedIssues
}
