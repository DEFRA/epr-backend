import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

/** @import {MetaLocation} from '#common/validation/validation-issue-kinds.js' */
/** @import {MetadataEntry} from '#domain/summary-logs/extractor/port.js' */

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
 * Where a meta field is: at its cell when the file has one, else by name alone.
 *
 * @param {MetadataEntry | undefined} field - The meta field from the parsed structure
 * @param {string} fieldName - The meta field name constant
 * @returns {MetaLocation}
 */
export const buildMetaFieldLocation = (field, fieldName) =>
  field?.location
    ? { ...field.location, field: fieldName }
    : { field: fieldName }

/**
 * Extracts a meta field from parsed summary log structure
 *
 * @param {Object} parsed - The parsed summary log structure
 * @param {string} fieldName - The meta field name to extract
 * @returns {Object} The meta field object containing value and location
 */
export const extractMetaField = (parsed, fieldName) => parsed?.meta?.[fieldName]
