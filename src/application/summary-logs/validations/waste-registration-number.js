import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Validates that the waste registration number in the spreadsheet matches the registration's waste registration number
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @throws {Error} If validation fails
 */
export const validateWasteRegistrationNumber = ({
  parsed,
  registration,
  loggingContext
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
    message: `Registration number validated: ${loggingContext}, registrationNumber=${wasteRegistrationNumber}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}
