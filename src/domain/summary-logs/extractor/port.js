/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */

/**
 * @typedef {Object} CellLocation
 * @property {string} sheet - Worksheet name
 * @property {number} row - Row number (1-indexed)
 * @property {string} column - Column letter (A, B, AA, etc.)
 */

/**
 * @typedef {Object} MetadataEntry
 * @property {*} value - The metadata value
 * @property {CellLocation} location - Location where the value was found
 */

/**
 * @typedef {Object} DataSection
 * @property {CellLocation} location - Starting location of the data section
 * @property {Array<string|null>} headers - Column headers (null for skipped columns)
 * @property {Array<Array<*>>} rows - Data rows
 */

/**
 * @typedef {Object} ParsedSummaryLog
 * @property {Object<string, MetadataEntry>} meta - Metadata extracted from the summary log, keyed by metadata name
 * @property {Object<string, DataSection>} data - Data sections extracted from the summary log, keyed by section name
 */

/**
 * @typedef {Object} SummaryLogExtractor
 * @property {(summaryLog: SummaryLog) => Promise<ParsedSummaryLog>} extract
 */
