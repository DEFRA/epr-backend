/**
 * Spreadsheet marker constants for EPR summary log templates
 *
 * All EPR-specific markers use the __EPR prefix to distinguish them
 * from user data in the spreadsheet.
 */

/** Base prefix for all EPR template markers */
export const EPR_PREFIX = '__EPR'

/** Marker prefix for metadata fields (e.g., __EPR_META_REGISTRATION) */
export const META_PREFIX = `${EPR_PREFIX}_META_`

/** Marker prefix for data section starts (e.g., __EPR_DATA_UPDATE_WASTE_BALANCE) */
export const DATA_PREFIX = `${EPR_PREFIX}_DATA_`

/** Special marker to skip a column in data collection */
export const SKIP_COLUMN = `${EPR_PREFIX}_SKIP_COLUMN`

/**
 * Helper to check if a header is an EPR marker
 * @param {string} header - Header value to check
 * @returns {boolean} True if header is an EPR marker
 */
export const isEprMarker = (header) => {
  return String(header).startsWith(EPR_PREFIX)
}
