import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { createValidationIssues } from '#common/validation/validation-issues.js'

import { validateMetaSyntax } from './validations/meta-syntax.js'
import { validateMetaBusiness } from './validations/meta-business.js'
import { validateDataSyntax } from './validations/data-syntax.js'
import { validateDataBusiness } from './validations/data-business.js'
import { transformFromSummaryLog } from '#application/waste-records/transform-from-summary-log.js'
import { classifyLoads } from './classify-loads.js'

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
      accreditationId: summaryLog.accreditationId
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
 * @typedef {Object} ValidationResult
 * @property {ReturnType<typeof createValidationIssues>} issues - Validation issues object with methods like getAllIssues(), isFatal()
 * @property {ValidatedWasteRecord[]|null} wasteRecords - Waste records with validation issues (null if transformation not reached)
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
 * @returns {Promise<ValidationResult>} Validation result with issues and transformed records
 */
const performValidationChecks = async ({
  summaryLogId,
  summaryLog,
  loggingContext,
  summaryLogExtractor,
  organisationsRepository,
  wasteRecordsRepository
}) => {
  const issues = createValidationIssues()
  let wasteRecords = null

  try {
    const parsed = await extractSummaryLog({
      summaryLogExtractor,
      summaryLog,
      loggingContext
    })

    issues.merge(validateMetaSyntax({ parsed }))

    if (issues.isFatal()) {
      return { issues, wasteRecords }
    }

    const registration = await fetchRegistration({
      organisationsRepository,
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      loggingContext
    })

    issues.merge(validateMetaBusiness({ parsed, registration, loggingContext }))

    if (issues.isFatal()) {
      return { issues, wasteRecords }
    }

    // Data syntax validation returns validated data with issues attached to rows
    const { issues: dataSyntaxIssues, validatedData } = validateDataSyntax({
      parsed
    })
    issues.merge(dataSyntaxIssues)

    if (issues.isFatal()) {
      return { issues, wasteRecords }
    }

    const dataResult = await transformAndValidateData({
      summaryLogId,
      summaryLog,
      validatedData,
      wasteRecordsRepository
    })

    wasteRecords = dataResult.wasteRecords
    issues.merge(dataResult.issues)
  } catch (error) {
    logger.error({
      error,
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

  return { issues, wasteRecords }
}

/**
 * Creates a summary logs validator function
 *
 * @param {Object} params
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {WasteRecordsRepository} params.wasteRecordsRepository
 * @param {SummaryLogExtractor} params.summaryLogExtractor
 * @returns {Function} Function that validates a summary log by ID
 */
export const createSummaryLogsValidator =
  ({
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogExtractor
  }) =>
  async (summaryLogId) => {
    const result = await summaryLogsRepository.findById(summaryLogId)

    if (!result) {
      throw new Error(`Summary log not found: summaryLogId=${summaryLogId}`)
    }

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

    const { issues, wasteRecords } = await performValidationChecks({
      summaryLogId,
      summaryLog,
      loggingContext,
      summaryLogExtractor,
      organisationsRepository,
      wasteRecordsRepository
    })

    const status = issues.isFatal()
      ? SUMMARY_LOG_STATUS.INVALID
      : SUMMARY_LOG_STATUS.VALIDATED

    // Calculate load counts only for validated summary logs
    // wasteRecords is guaranteed to be non-null when status is VALIDATED
    // because we only reach VALIDATED if we passed all short-circuits
    const loadCounts =
      status === SUMMARY_LOG_STATUS.VALIDATED && wasteRecords
        ? classifyLoads({
            wasteRecords,
            summaryLogId
          })
        : null

    await summaryLogsRepository.update(summaryLogId, version, {
      status,
      validation: {
        issues: issues.getAllIssues()
      },
      ...(loadCounts && { loadCounts }),
      ...(issues.isFatal() && {
        failureReason: issues.getAllIssues()[0].message
      })
    })

    logger.info({
      message: `Summary log updated: ${loggingContext}, status=${status}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  }
