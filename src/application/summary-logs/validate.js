import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { validateWasteRegistrationNumber } from './validations/waste-registration-number.js'
import { validateSummaryLogType } from './validations/summary-log-type.js'
import { validateSummaryLogMaterialType } from './validations/summary-log-material-type.js'

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

  if (!registration) {
    throw new Error(
      `Registration not found: organisationId=${organisationId}, registrationId=${registrationId}`
    )
  }

  logger.info({
    message: `Fetched registration: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return registration
}

const performValidationChecks = async ({
  summaryLog,
  loggingContext,
  summaryLogExtractor,
  organisationsRepository
}) => {
  const parsed = await summaryLogExtractor.extract(summaryLog)

  logger.info({
    message: `Extracted summary log file: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  const registration = await fetchRegistration({
    organisationsRepository,
    organisationId: summaryLog.organisationId,
    registrationId: summaryLog.registrationId,
    loggingContext
  })

  const validators = [
    validateWasteRegistrationNumber,
    validateSummaryLogType,
    validateSummaryLogMaterialType
  ]

  for (const validate of validators) {
    validate({
      parsed,
      registration,
      loggingContext
    })
  }

  return parsed
}

const handleValidationSuccess = async ({
  summaryLogId,
  version,
  loggingContext,
  summaryLogsRepository
}) => {
  await summaryLogsRepository.update(summaryLogId, version, {
    status: SUMMARY_LOG_STATUS.VALIDATED
  })

  logger.info({
    message: `Summary log updated: ${loggingContext}, status=${SUMMARY_LOG_STATUS.VALIDATED}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}

const handleValidationFailure = async ({
  summaryLogId,
  version,
  loggingContext,
  error,
  summaryLogsRepository
}) => {
  logger.error({
    error,
    message: `Failed to extract summary log file: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
    }
  })

  await summaryLogsRepository.update(summaryLogId, version, {
    status: SUMMARY_LOG_STATUS.INVALID,
    failureReason: error.message
  })

  logger.info({
    message: `Summary log updated: ${loggingContext}, status=${SUMMARY_LOG_STATUS.INVALID}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
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

    try {
      await performValidationChecks({
        summaryLog,
        loggingContext,
        summaryLogExtractor,
        organisationsRepository
      })
    } catch (error) {
      try {
        await handleValidationFailure({
          summaryLogId,
          version,
          loggingContext,
          error,
          summaryLogsRepository
        })
      } catch (failureHandlingError) {
        logger.error({
          error: failureHandlingError,
          message: `Failed to handle validation failure: ${loggingContext}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
          }
        })
      }
      throw error
    }

    await handleValidationSuccess({
      summaryLogId,
      version,
      loggingContext,
      summaryLogsRepository
    })
  }
