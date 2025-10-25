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
 * Parses an Excel summary log buffer and extracts metadata and tabular data sections.
 *
 * Recognizes two types of markers in the spreadsheet:
 * - Metadata markers: `__EPR_META_<NAME>` followed by a value in the next cell
 * - Data section markers: `__EPR_DATA_<NAME>` followed by column headers, then rows of data
 *
 * Data sections continue until an empty row is encountered or the worksheet ends.
 * Column headers can include `__EPR_SKIP_COLUMN` to mark columns that should be captured but have no header name.
 *
 * @example
 * const result = await parse(excelBuffer)
 * // result.meta.PROCESSING_TYPE = { value: 'REPROCESSOR', location: { sheet: 'Sheet1', row: 1, column: 'B' } }
 * // result.data.UPDATE_WASTE_BALANCE = { location: {...}, headers: ['REF', 'DATE'], rows: [[123, '2025-01-01']] }
 *
 * @typedef {(buffer: Buffer) => Promise<ParsedSummaryLog>} SummaryLogParser
 */

/**
 * @typedef {Object} SummaryLogExtractor
 * @property {(summaryLog: SummaryLog) => Promise<ParsedSummaryLog>} extract
 */
