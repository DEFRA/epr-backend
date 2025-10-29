import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Mapping between spreadsheet type values and registration waste processing types
 */
const SPREADSHEET_TYPE_TO_REGISTRATION_TYPE = {
  REPROCESSOR: 'reprocessor',
  EXPORTER: 'exporter'
}

const VALID_REGISTRATION_TYPES = Object.values(
  SPREADSHEET_TYPE_TO_REGISTRATION_TYPE
)

/**
 * Validates that the summary log type in the spreadsheet matches the registration's waste processing type
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @throws {Error} If validation fails
 */
export const validateSummaryLogType = ({
  parsed,
  registration,
  loggingContext
}) => {
  const { wasteProcessingType } = registration
  const spreadsheetType = parsed?.meta?.SUMMARY_LOG_TYPE?.value

  if (!spreadsheetType) {
    throw new Error('Invalid summary log: missing summary log type')
  }

  if (!VALID_REGISTRATION_TYPES.includes(wasteProcessingType)) {
    logger.error({
      message: `Unexpected registration type: ${loggingContext}, wasteProcessingType=${wasteProcessingType}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
  }

  const expectedRegistrationType =
    SPREADSHEET_TYPE_TO_REGISTRATION_TYPE[spreadsheetType]
  if (expectedRegistrationType !== wasteProcessingType) {
    throw new Error('Summary log type does not match registration type')
  }

  logger.info({
    message: `Summary log type validated: ${loggingContext}, spreadsheetType=${spreadsheetType}, wasteProcessingType=${wasteProcessingType}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}
