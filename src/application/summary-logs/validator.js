import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */
/** @typedef {import('#domain/summary-logs/status.js').SummaryLogStatus} SummaryLogStatus */
/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./extractor.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('./updater.js').SummaryLogUpdater} SummaryLogUpdater */

/**
 * Mapping between spreadsheet type values and database type values
 */
const SPREADSHEET_TYPE_TO_DB_TYPE = {
  REPROCESSOR: 'reprocessor',
  EXPORTER: 'exporter'
}

const VALID_SPREADSHEET_TYPES = Object.keys(SPREADSHEET_TYPE_TO_DB_TYPE)

/**
 * Fetches a registration from the organisations repository
 *
 * @param {Object} params
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.msg
 * @returns {Promise<Object>}
 */
export const fetchRegistration = async ({
  organisationsRepository,
  organisationId,
  registrationId,
  msg
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
    message: `Fetched registration: ${msg}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return registration
}

/**
 * Validates that the waste registration number in the spreadsheet matches the registration's waste registration number
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.msg - Logging context message
 * @throws {Error} If validation fails
 */
export const validateWasteRegistrationNumber = ({
  parsed,
  registration,
  msg
}) => {
  const { wasteRegistrationNumber } = registration
  const spreadsheetRegistrationNumber =
    parsed?.meta?.WASTE_REGISTRATION_NUMBER?.value

  if (!wasteRegistrationNumber) {
    throw new Error(
      'Invalid summary log: registration has no waste registration number'
    )
  }

  if (!spreadsheetRegistrationNumber) {
    throw new Error('Invalid summary log: missing registration number')
  }

  if (spreadsheetRegistrationNumber !== wasteRegistrationNumber) {
    throw new Error(
      "Summary log's waste registration number does not match this registration"
    )
  }

  logger.info({
    message: `Registration number validated: ${msg}, registrationNumber=${wasteRegistrationNumber}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}

/**
 * Validates that the summary log type in the spreadsheet matches the registration's waste processing type
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.msg - Logging context message
 * @throws {Error} If validation fails
 */
export const validateSummaryLogType = ({ parsed, registration, msg }) => {
  const { wasteProcessingType } = registration
  const spreadsheetType = parsed?.meta?.SUMMARY_LOG_TYPE?.value

  if (!spreadsheetType) {
    throw new Error('Invalid summary log: missing summary log type')
  }

  if (!VALID_SPREADSHEET_TYPES.includes(spreadsheetType)) {
    throw new Error('Invalid summary log: unrecognized summary log type')
  }

  const expectedDbType = SPREADSHEET_TYPE_TO_DB_TYPE[spreadsheetType]
  if (expectedDbType !== wasteProcessingType) {
    throw new Error('Summary log type does not match registration type')
  }

  logger.info({
    message: `Summary log type validated: ${msg}, spreadsheetType=${spreadsheetType}, wasteProcessingType=${wasteProcessingType}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}

/**
 * SummaryLogsValidator class that handles validation of summary log files
 */
export class SummaryLogsValidator {
  /**
   * @param {Object} params
   * @param {SummaryLogsRepository} params.summaryLogsRepository
   * @param {OrganisationsRepository} params.organisationsRepository
   * @param {SummaryLogExtractor} params.summaryLogExtractor
   * @param {SummaryLogUpdater} params.summaryLogUpdater
   */
  constructor({
    summaryLogsRepository,
    organisationsRepository,
    summaryLogExtractor,
    summaryLogUpdater
  }) {
    this.summaryLogsRepository = summaryLogsRepository
    this.organisationsRepository = organisationsRepository
    this.summaryLogExtractor = summaryLogExtractor
    this.summaryLogUpdater = summaryLogUpdater
  }

  /**
   * Performs validation checks on the parsed summary log
   *
   * @param {Object} params
   * @param {SummaryLog} params.summaryLog
   * @param {string} params.msg
   * @returns {Promise<Object>}
   */
  async performValidationChecks({ summaryLog, msg }) {
    const parsed = await this.summaryLogExtractor.extract(summaryLog)

    logger.info({
      message: `Extracted summary log file: ${msg}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })

    const registration = await fetchRegistration({
      organisationsRepository: this.organisationsRepository,
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      msg
    })

    validateWasteRegistrationNumber({
      parsed,
      registration,
      msg
    })

    validateSummaryLogType({
      parsed,
      registration,
      msg
    })

    return parsed
  }

  /**
   * Handles successful validation by updating status
   *
   * @param {Object} params
   * @param {string} params.summaryLogId
   * @param {number} params.version
   * @param {SummaryLog} params.summaryLog
   * @param {string} params.msg
   * @returns {Promise<void>}
   */
  async handleValidationSuccess({ summaryLogId, version, summaryLog, msg }) {
    await this.summaryLogUpdater.update({
      id: summaryLogId,
      version,
      summaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED
    })

    logger.info({
      message: `Summary log updated: ${msg}, status=${SUMMARY_LOG_STATUS.VALIDATED}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  }

  /**
   * Handles validation failure by updating status and logging
   *
   * @param {Object} params
   * @param {string} params.summaryLogId
   * @param {number} params.version
   * @param {SummaryLog} params.summaryLog
   * @param {string} params.msg
   * @param {Error} params.error
   * @returns {Promise<void>}
   */
  async handleValidationFailure({
    summaryLogId,
    version,
    summaryLog,
    msg,
    error
  }) {
    logger.error({
      error,
      message: `Failed to extract summary log file: ${msg}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    await this.summaryLogUpdater.update({
      id: summaryLogId,
      version,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: error.message
    })

    logger.info({
      message: `Summary log updated: ${msg}, status=${SUMMARY_LOG_STATUS.INVALID}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  }

  /**
   * @param {string} summaryLogId
   * @returns {Promise<void>}
   */
  async validate(summaryLogId) {
    const result = await this.summaryLogsRepository.findById(summaryLogId)

    if (!result) {
      throw new Error(`Summary log not found: summaryLogId=${summaryLogId}`)
    }

    const { version, summaryLog } = result
    const {
      file: { id: fileId, name: filename }
    } = summaryLog

    const msg = `summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}`

    logger.info({
      message: `Summary log validation started: ${msg}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    try {
      await this.performValidationChecks({ summaryLog, msg })
      await this.handleValidationSuccess({
        summaryLogId,
        version,
        summaryLog,
        msg
      })
    } catch (error) {
      await this.handleValidationFailure({
        summaryLogId,
        version,
        summaryLog,
        msg,
        error
      })
      throw error
    }
  }
}
