import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  createValidationIssues,
  VALIDATION_CATEGORY
} from '#common/validation/validation-issues.js'

import { validateMetaSyntax } from './validations/meta-syntax.js'
import { validateDataSyntax } from './validations/data-syntax.js'
import { validateAccreditationNumber } from './validations/accreditation-number.js'
import { validateRegistrationNumber } from './validations/registration-number.js'
import { validateProcessingType } from './validations/processing-type.js'
import { validateMaterialType } from './validations/material-type.js'

/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */
/** @typedef {import('#domain/summary-logs/status.js').SummaryLogStatus} SummaryLogStatus */
/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./extractor.js').SummaryLogExtractor} SummaryLogExtractor */

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
 *   - Continues even with errors (non-fatal)
 *
 * Level 4: Data Business (ERROR/WARNING)
 *   - Validates data table rows against business rules (e.g., waste balance calculations)
 *   - Currently placeholder - to be implemented
 *
 * This approach provides:
 * - Better performance (stops early on fatal errors)
 * - Clearer user feedback (fixes meta issues before seeing data errors)
 * - Reduced noise in validation output
 * - Logical separation between meta and data validation phases
 *
 * Converts any exceptions to fatal technical issues.
 *
 * @param {Object} params
 * @param {SummaryLog} params.summaryLog - The summary log to validate
 * @param {string} params.loggingContext - Context string for logging (e.g., "summaryLogId=123, fileId=456")
 * @param {SummaryLogExtractor} params.summaryLogExtractor - Extractor service for parsing the file
 * @param {OrganisationsRepository} params.organisationsRepository - Organisation repository for fetching registration data
 * @returns {Promise<Object>} Validation issues object with methods like getAllIssues(), isFatal()
 */
const performValidationChecks = async ({
  summaryLog,
  loggingContext,
  summaryLogExtractor,
  organisationsRepository
}) => {
  const issues = createValidationIssues()

  try {
    const parsed = await summaryLogExtractor.extract(summaryLog)

    logger.info({
      message: `Extracted summary log file: ${loggingContext}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })

    issues.merge(validateMetaSyntax({ parsed }))

    if (issues.isFatal()) {
      return issues
    }

    const registration = await fetchRegistration({
      organisationsRepository,
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      loggingContext
    })

    for (const validate of [
      validateRegistrationNumber,
      validateProcessingType,
      validateAccreditationNumber,
      validateMaterialType
    ]) {
      issues.merge(validate({ parsed, registration, loggingContext }))
    }

    if (issues.isFatal()) {
      return issues
    }

    issues.merge(validateDataSyntax({ parsed }))
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
      'VALIDATION_FAILED'
    )
  }

  return issues
}

/**
 * Creates a summary logs validator function
 *
 * @param {Object} params
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {SummaryLogExtractor} params.summaryLogExtractor
 * @returns {Function} Function that validates a summary log by ID
 */
export const createSummaryLogsValidator =
  ({ summaryLogsRepository, organisationsRepository, summaryLogExtractor }) =>
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

    const issues = await performValidationChecks({
      summaryLog,
      loggingContext,
      summaryLogExtractor,
      organisationsRepository
    })

    const status = issues.isFatal()
      ? SUMMARY_LOG_STATUS.INVALID
      : SUMMARY_LOG_STATUS.VALIDATED

    await summaryLogsRepository.update(summaryLogId, version, {
      status,
      validation: {
        issues: issues.getAllIssues()
      },
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
