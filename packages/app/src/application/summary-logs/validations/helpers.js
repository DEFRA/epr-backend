import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Logs successful validation with consistent structure
 *
 * @param {string} message - The success message to log
 */
export const logValidationSuccess = (message) => {
  logger.info({
    message,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}

/**
 * Builds a location object for meta field validation errors
 *
 * @param {Object} field - The meta field object from parsed structure
 * @param {string} fieldName - The meta field name constant
 * @returns {Object} Location object with field name
 */
export const buildMetaFieldLocation = (field, fieldName) => ({
  ...field?.location,
  field: fieldName
})

/**
 * Extracts a meta field from parsed summary log structure
 *
 * @param {Object} parsed - The parsed summary log structure
 * @param {string} fieldName - The meta field name to extract
 * @returns {Object} The meta field object containing value and location
 */
export const extractMetaField = (parsed, fieldName) => parsed?.meta?.[fieldName]
