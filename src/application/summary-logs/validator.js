import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */
/** @typedef {import('#domain/summary-logs/parser/port.js').SummaryLogsParser} SummaryLogsParser */
/** @typedef {import('#domain/summary-logs/status.js').SummaryLogStatus} SummaryLogStatus */
/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

/**
 * @param {Object} params
 * @param {UploadsRepository} params.uploadsRepository
 * @param {SummaryLog} params.summaryLog
 * @param {string} params.msg
 * @returns {Promise<Buffer|undefined>}
 */
const fetchSummaryLog = async ({ uploadsRepository, summaryLog, msg }) => {
  const {
    file: {
      s3: { bucket: s3Bucket, key: s3Key }
    }
  } = summaryLog

  const summaryLogBuffer = await uploadsRepository.findByLocation({
    bucket: s3Bucket,
    key: s3Key
  })

  if (summaryLogBuffer) {
    logger.info({
      message: `Fetched summary log file: ${msg}, s3Path=${s3Bucket}/${s3Key}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  } else {
    logger.warn({
      message: `Failed to fetch summary log file: ${msg}, s3Path=${s3Bucket}/${s3Key}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
  }

  return summaryLogBuffer
}

/**
 * @param {Object} params
 * @param {SummaryLogsParser} params.summaryLogsParser
 * @param {Buffer} params.summaryLogBuffer
 * @param {string} params.msg
 * @returns {Promise<Object>}
 */
const parseSummaryLog = async ({
  summaryLogsParser,
  summaryLogBuffer,
  msg
}) => {
  const parsed = await summaryLogsParser.parse(summaryLogBuffer)

  logger.info({
    message: `Parsed summary log file: ${msg}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return parsed
}

/**
 * Fetches a registration from the organisations repository
 *
 * @param {Object} params
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} params.organisationsRepository
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
 * @param {Object} params
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {string} params.id
 * @param {number} params.version
 * @param {SummaryLog} params.summaryLog
 * @param {SummaryLogStatus} params.status
 * @param {string|undefined|null} [params.failureReason]
 * @param {string} params.msg
 * @returns {Promise<void>}
 */
const updateSummaryLog = async ({
  summaryLogsRepository,
  id,
  version,
  summaryLog,
  status,
  failureReason,
  msg
}) => {
  const { failureReason: existingFailureReason } = summaryLog

  const updates = { status, failureReason }

  if (existingFailureReason && status === SUMMARY_LOG_STATUS.VALIDATED) {
    updates.failureReason = null
  }

  await summaryLogsRepository.update(id, version, updates)

  logger.info({
    message: `Summary log updated: ${msg}, status=${status}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
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
      `Registration number mismatch: spreadsheet contains ${spreadsheetRegistrationNumber} but registration is ${wasteRegistrationNumber}`
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
 * @param {Object} params
 * @param {UploadsRepository} params.uploadsRepository
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {SummaryLogsParser} params.summaryLogsParser
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} params.organisationsRepository
 * @param {string} params.summaryLogId
 * @returns {Promise<void>}
 */
export const summaryLogsValidator = async ({
  uploadsRepository,
  summaryLogsRepository,
  summaryLogsParser,
  organisationsRepository,
  summaryLogId
}) => {
  const result = await summaryLogsRepository.findById(summaryLogId)

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
    const summaryLogBuffer = await fetchSummaryLog({
      uploadsRepository,
      summaryLog,
      msg
    })

    if (!summaryLogBuffer) {
      throw new Error('Something went wrong while retrieving your file upload')
    }

    const parsed = await parseSummaryLog({
      summaryLogsParser,
      summaryLogBuffer,
      msg
    })

    const registration = await fetchRegistration({
      organisationsRepository,
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      msg
    })

    validateWasteRegistrationNumber({
      parsed,
      registration,
      msg
    })

    await updateSummaryLog({
      summaryLogsRepository,
      id: summaryLogId,
      version,
      summaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED,
      msg
    })
  } catch (error) {
    logger.error({
      error,
      message: `Failed to process summary log file: ${msg}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    await updateSummaryLog({
      summaryLogsRepository,
      id: summaryLogId,
      version,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: error.message,
      msg
    })

    throw error
  }
}
