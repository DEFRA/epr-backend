import { SpreadsheetValidationError } from '#adapters/parsers/summary-logs/exceljs-parser.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/index.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'
import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

import { summaryLogRowStatesForRegistration } from '#waste-records/application/read-summary-log-row-states.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import {
  findSchemaForProcessingType,
  PROCESSING_TYPE_TABLES
} from '#domain/summary-logs/table-schemas/index.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  classifyLoads,
  fetchPeriodicReports,
  filterWasteBalanceRecords,
  resolveOverseasSitesContext
} from './classify-and-persist.js'
import { logValidationIssues } from './validate-issue-logging.js'
import { createDataSyntaxValidator } from './validations/data-syntax.js'
import { validateMetaBusiness } from './validations/meta-business.js'
import { validateMetaSyntax } from './validations/meta-syntax.js'
import { capIssuesForStorage } from './cap-issues-for-storage.js'
import { transformAndValidateData } from './transform-and-validate-data.js'
import { ledgerIdFor } from './ledger-id.js'

export { MAX_VALIDATION_ISSUES } from './validate-issue-logging.js'
export { MAX_ACTUAL_LENGTH } from './cap-issues-for-storage.js'

/** @import {ValidatedSummaryLog, ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {ParsedSummaryLog} from '#domain/summary-logs/extractor/port.js' */
/** @import {ProcessingType} from '#domain/summary-logs/meta-fields.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */
/** @import {SummaryLogStatus} from '#domain/summary-logs/status.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {SummaryLogRowStateRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {SummaryLogExtractor} from './extractor.js' */
/** @import {Loads} from './load-counts.js' */
/** @import {LoadsByReportingPeriod} from './period-status.js' */
/** @import {ReportsService} from '#reports/application/report-service.js' */

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
 *   summaryLog: SubmittedSummaryLog,
 *   loggingContext: string,
 *   logger: TypedLogger,
 *   summaryLogExtractor: SummaryLogExtractor,
 *   organisationsRepository: OrganisationsRepository,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository,
 *   ledgerRepository: WasteBalanceLedgerRepository,
 *   validateDataSyntax: (parsed: ParsedSummaryLog) => { issues: ValidationIssuesCollector, validatedData: ValidatedSummaryLog }
 * }} params
 * @returns {Promise<ValidationResult>}
 */
const performValidationChecks = async ({
  summaryLog,
  loggingContext,
  logger,
  summaryLogExtractor,
  organisationsRepository,
  summaryLogRowStateRepository,
  ledgerRepository,
  validateDataSyntax
}) => {
  const issues = createValidationIssues()
  /** @type {ValidatedWasteRecord[] | null} */
  let wasteRecords = null
  /** @type {ExtractedMeta | undefined} */
  let meta
  /** @type {Registration | undefined} */
  let registration

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
      summaryLog,
      validatedData,
      registration,
      summaryLogRowStateRepository,
      ledgerRepository
    })

    wasteRecords = dataResult.wasteRecords

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

  return { issues, wasteRecords, meta, registration }
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
 * @param {LoadsByReportingPeriod | null} params.loadsByReportingPeriod
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
  loadsByReportingPeriod,
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
    ...(loadsByReportingPeriod && { loadsByReportingPeriod }),
    ...(meta && { meta })
  })
}

/**
 * Loads the registration's row state at its latest submitted summary log, keyed
 * by `${wasteRecordType}:${rowId}` — the baseline the check-page projections
 * classify this upload's rows against.
 *
 * @param {{
 *   ledgerRepository: WasteBalanceLedgerRepository,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository,
 *   summaryLog: SubmittedSummaryLog,
 *   registration: Registration | undefined
 * }} params
 * @returns {Promise<Map<string, import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState>>}
 */
const loadSubmittedRowStatesByKey = async ({
  ledgerRepository,
  summaryLogRowStateRepository,
  summaryLog,
  registration
}) => {
  const submittedRowStates = await summaryLogRowStatesForRegistration({
    ...ledgerIdFor(summaryLog, registration),
    ledgerRepository,
    summaryLogRowStateRepository
  })

  return new Map(
    submittedRowStates.map((state) => [
      `${state.wasteRecordType}:${state.rowId}`,
      state
    ])
  )
}

/**
 * Fetches periodic reports, classifies loads, and persists the validation result.
 */
const classifyAndPersistResult = async ({
  issues,
  processingType,
  status,
  summaryLogId,
  wasteBalanceRecords,
  wasteRecords,
  registration,
  meta,
  summaryLog,
  summaryLogsRepository,
  summaryLogRowStateRepository,
  ledgerRepository,
  version,
  reportsService,
  organisationsRepository,
  overseasSitesRepository
}) => {
  const periodicReports = await fetchPeriodicReports({
    registration,
    status,
    summaryLog,
    reportsService
  })

  const overseasSites = await resolveOverseasSitesContext({
    processingType,
    summaryLog,
    organisationsRepository,
    overseasSitesRepository
  })

  const submittedRowStatesByKey = await loadSubmittedRowStatesByKey({
    ledgerRepository,
    summaryLogRowStateRepository,
    summaryLog,
    registration
  })

  const { loads, loadsByReportingPeriod } = classifyLoads({
    processingType,
    status,
    wasteBalanceRecords,
    wasteRecords,
    periodicReports,
    overseasSites,
    registration,
    submittedRowStatesByKey
  })

  await persistValidationResult({
    issues,
    loads,
    loadsByReportingPeriod,
    meta,
    status,
    summaryLog,
    summaryLogId,
    summaryLogsRepository,
    version
  })
}

/**
 * Creates a summary logs validator function.
 *
 * @param {{
 *   logger: TypedLogger,
 *   summaryLogsRepository: SummaryLogsRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository,
 *   ledgerRepository: WasteBalanceLedgerRepository,
 *   reportsService: ReportsService,
 *   overseasSitesRepository: OverseasSitesRepository,
 *   summaryLogExtractor: SummaryLogExtractor
 * }} params
 * @returns {(summaryLogId: string) => Promise<void>}
 */
export const createSummaryLogsValidator = ({
  logger,
  summaryLogsRepository,
  organisationsRepository,
  summaryLogRowStateRepository,
  ledgerRepository,
  reportsService,
  overseasSitesRepository,
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
    const { id: fileId, name: filename } = summaryLog.file
    const loggingContext = `summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}`

    logger.info({
      message: `Summary log validation started: ${loggingContext}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    const validationStart = Date.now()
    const { issues, wasteRecords, meta, registration } =
      await performValidationChecks({
        summaryLog,
        loggingContext,
        logger,
        summaryLogExtractor,
        organisationsRepository,
        summaryLogRowStateRepository,
        ledgerRepository,
        validateDataSyntax
      })

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
      validationDurationMs: Date.now() - validationStart,
      wasteBalanceRecords
    })

    await classifyAndPersistResult({
      issues,
      processingType,
      status,
      summaryLogId,
      wasteBalanceRecords,
      wasteRecords,
      registration,
      meta,
      summaryLog,
      summaryLogsRepository,
      summaryLogRowStateRepository,
      ledgerRepository,
      version,
      reportsService,
      organisationsRepository,
      overseasSitesRepository
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
