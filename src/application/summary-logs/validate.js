/** @import {SummaryLogId} from '#domain/summary-logs/ids.js' */
import { SpreadsheetValidationError } from '#adapters/parsers/summary-logs/exceljs-parser.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/index.js'
import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

import { summaryLogRowStatesForRegistration } from '#waste-records/application/read-summary-log-row-states.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { getTemplate } from '#domain/summary-logs/table-schemas/index.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { classificationContextOf } from '#waste-balances/application/read-model-accreditations.js'
import {
  classifyLoads,
  fetchPeriodicReports,
  filterWasteBalanceRecords
} from './classify-and-persist.js'
import { withPeriodsRequiringResubmission } from './periods-requiring-resubmission.js'
import { logValidationIssues } from './validate-issue-logging.js'
import { createDataSyntaxValidator } from './validations/data-syntax.js'
import { validateMetaBusiness } from './validations/meta-business.js'
import { validateMetaSyntax } from './validations/meta-syntax.js'
import { capIssuesForStorage } from './cap-issues-for-storage.js'
import { transformAndValidateData } from './transform-and-validate-data.js'
import { ledgerIdFor } from './ledger-id.js'
import { registrationForSummaryLog } from './registration-for-summary-log.js'
import { recordValidationMetrics } from './validation-metrics.js'

export { MAX_VALIDATION_ISSUES } from './validate-issue-logging.js'
export { MAX_ACTUAL_LENGTH } from './cap-issues-for-storage.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {SummaryLogRegistration} from './registration-for-summary-log.js' */
/** @import {ParsedSummaryLog} from '#domain/summary-logs/extractor/port.js' */
/** @import {ProcessingType} from '#domain/summary-logs/meta-fields.js' */
/** @import {OrganisationReadRepository} from '#organisation-read-model/repository/port.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */
/** @import {SummaryLogStatus} from '#domain/summary-logs/status.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {SummaryLogExtractor} from './extractor.js' */
/** @import {Loads} from '#domain/summary-logs/loads-schema.js' */
/** @import {LoadsByReportingPeriod} from '#domain/summary-logs/loads-by-period-status-schema.js' */
/** @import {ReportsService} from '#reports/application/report-service.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {AccreditationValidity} from '#domain/organisations/accreditation.js' */
/** @import {ClassificationContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

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
 *   organisationReadRepository: OrganisationReadRepository,
 *   summaryLog: SubmittedSummaryLog,
 *   loggingContext: string,
 *   logger: TypedLogger
 * }} params
 * @returns {Promise<SummaryLogRegistration>}
 */
const fetchRegistration = async ({
  organisationReadRepository,
  summaryLog,
  loggingContext,
  logger
}) => {
  const registration = await registrationForSummaryLog(
    organisationReadRepository,
    summaryLog
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
 * @property {SummaryLogRegistration} [registration] - Registration fetched during validation
 * @property {ClassificationContext} [classificationContext] - The read model's accreditation for classifying rows, read with the registration
 * @property {Record<string, TableSchema>} [tableSchemas] - The template's table schemas, once meta syntax has chosen it
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
  /** @type {AccreditationValidity | null} */ accreditation,
  /** @type Record<string, TableSchema> */ tableSchemas
) => {
  for (const wasteRecord of wasteRecords) {
    const schema = tableSchemas[wasteRecord.tableName]

    /** @type {import('#domain/summary-logs/table-schemas/validation-pipeline.js').WasteBalanceClassificationResult | undefined} */
    const result = schema?.classifyForWasteBalance?.(wasteRecord.record.data, {
      accreditation,
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
 *   organisationReadRepository: OrganisationReadRepository,
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
 *   ledgerRepository: WasteBalanceLedgerRepository
 * }} params
 * @returns {Promise<ValidationResult>}
 */
const performValidationChecks = async ({
  summaryLog,
  loggingContext,
  logger,
  summaryLogExtractor,
  organisationReadRepository,
  summaryLogRowStatesRepository,
  ledgerRepository
}) => {
  const issues = createValidationIssues()
  /** @type {ValidatedWasteRecord[] | null} */
  let wasteRecords = null
  /** @type {ExtractedMeta | undefined} */
  let meta
  /** @type {SummaryLogRegistration | undefined} */
  let registration
  /** @type {ClassificationContext | undefined} */
  let classificationContext
  /** @type {Record<string, TableSchema> | undefined} */
  let tableSchemas

  try {
    const parsed = await extractSummaryLog({
      summaryLogExtractor,
      summaryLog,
      loggingContext,
      logger
    })

    meta = extractMetaValues(parsed.meta)

    issues.merge(validateMetaSyntax({ parsed, year: summaryLog.year }))

    if (issues.isFatal()) {
      return { issues, wasteRecords, meta }
    }

    tableSchemas = getTemplate(
      summaryLog.year,
      meta.PROCESSING_TYPE
    ).tableSchemas

    registration = await fetchRegistration({
      organisationReadRepository,
      summaryLog,
      loggingContext,
      logger
    })
    classificationContext = classificationContextOf(
      registration.accreditationYear === null
        ? null
        : { registration, year: registration.accreditationYear },
      /** @type {ProcessingType} */ (meta.PROCESSING_TYPE)
    )
    issues.merge(
      validateMetaBusiness({
        parsed,
        registration,
        loggingContext
      })
    )

    if (issues.isFatal()) {
      return {
        issues,
        wasteRecords,
        meta,
        registration,
        classificationContext,
        tableSchemas
      }
    }

    // Data syntax validation returns validated data with issues attached to rows
    const { issues: dataSyntaxIssues, validatedData } =
      createDataSyntaxValidator(tableSchemas)(parsed)
    issues.merge(dataSyntaxIssues)

    if (issues.isFatal()) {
      return {
        issues,
        wasteRecords,
        meta,
        registration,
        classificationContext,
        tableSchemas
      }
    }

    const dataResult = await transformAndValidateData({
      summaryLog,
      validatedData,
      tableSchemas,
      summaryLogRowStatesRepository,
      ledgerRepository
    })

    wasteRecords = dataResult.wasteRecords

    markIgnoredByDateRange(
      wasteRecords,
      classificationContext.accreditation,
      tableSchemas
    )

    issues.merge(dataResult.issues)
  } catch (error) {
    handleValidationFailure(
      /** @type {Error & { code?: string }} */ (error),
      issues,
      loggingContext,
      logger
    )
  }

  return {
    issues,
    wasteRecords,
    meta,
    registration,
    classificationContext,
    tableSchemas
  }
}

/**
 * @param {{ summaryLog: SummaryLog, version: number } | null | undefined} result
 * @param {SummaryLogId} summaryLogId
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
 * Persists the validation result to the summary log document.
 *
 * @param {Object} params
 * @param {ValidationIssuesCollector} params.issues
 * @param {Loads | null} params.loads
 * @param {LoadsByReportingPeriod | null} params.loadsByReportingPeriod
 * @param {ExtractedMeta | undefined} params.meta
 * @param {SummaryLogStatus} params.status
 * @param {SummaryLog} params.summaryLog
 * @param {SummaryLogId} params.summaryLogId
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
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
 *   summaryLog: SubmittedSummaryLog
 * }} params
 * @returns {Promise<Map<string, import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState>>}
 */
const loadSubmittedRowStatesByKey = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  summaryLog
}) => {
  const submittedRowStates = await summaryLogRowStatesForRegistration({
    ...ledgerIdFor(summaryLog),
    ledgerRepository,
    summaryLogRowStatesRepository
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
  tableSchemas,
  status,
  summaryLogId,
  wasteBalanceRecords,
  wasteRecords,
  registration,
  classificationContext,
  meta,
  summaryLog,
  summaryLogsRepository,
  summaryLogRowStatesRepository,
  ledgerRepository,
  version,
  reportsService,
  logger
}) => {
  const periodicReports = await fetchPeriodicReports({
    registration,
    status,
    summaryLog,
    reportsService
  })

  const submittedRowStatesByKey = await loadSubmittedRowStatesByKey({
    ledgerRepository,
    summaryLogRowStatesRepository,
    summaryLog
  })

  const { loads, loadsByReportingPeriod } = classifyLoads({
    tableSchemas,
    status,
    wasteBalanceRecords,
    wasteRecords,
    periodicReports,
    classificationContext,
    registration,
    submittedRowStatesByKey
  })

  await persistValidationResult({
    issues,
    loads,
    loadsByReportingPeriod: await withPeriodsRequiringResubmission({
      loadsByReportingPeriod,
      periodicReports,
      wasteRecords,
      registration,
      classificationContext,
      summaryLog,
      summaryLogId,
      reportsService,
      summaryLogRowStatesRepository,
      logger
    }),
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
 *   organisationReadRepository: OrganisationReadRepository,
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
 *   ledgerRepository: WasteBalanceLedgerRepository,
 *   reportsService: ReportsService,
 *   summaryLogExtractor: SummaryLogExtractor
 * }} params
 * @returns {(summaryLogId: SummaryLogId) => Promise<void>}
 */
export const createSummaryLogsValidator = ({
  logger,
  summaryLogsRepository,
  organisationReadRepository,
  summaryLogRowStatesRepository,
  ledgerRepository,
  reportsService,
  summaryLogExtractor
}) => {
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
    const {
      issues,
      wasteRecords,
      meta,
      registration,
      classificationContext,
      tableSchemas
    } = await performValidationChecks({
      summaryLog,
      loggingContext,
      logger,
      summaryLogExtractor,
      organisationReadRepository,
      summaryLogRowStatesRepository,
      ledgerRepository
    })

    logValidationIssues({ summaryLogId, summaryLog, issues, logger })

    const processingType = meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]
    const status = issues.isFatal()
      ? SUMMARY_LOG_STATUS.INVALID
      : SUMMARY_LOG_STATUS.VALIDATED
    const wasteBalanceRecords = filterWasteBalanceRecords(
      wasteRecords,
      tableSchemas
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
      tableSchemas,
      status,
      summaryLogId,
      wasteBalanceRecords,
      wasteRecords,
      registration,
      classificationContext,
      meta,
      summaryLog,
      summaryLogsRepository,
      summaryLogRowStatesRepository,
      ledgerRepository,
      version,
      reportsService,
      logger
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
