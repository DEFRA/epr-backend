/**
 * Waste records export module
 *
 * Streams a CSV containing every waste record in the system, with the union
 * of every summary-log field across all schemas plus operator metadata and
 * a boolean indicating waste-balance inclusion.
 *
 * @module waste-records-export
 */

export { streamSubmissionCsvToReadable } from './application/stream-submission-csv.js'
export { sanitiseFormulaInjection } from './domain/csv-columns.js'

export { wasteRecordsExportRoute } from './routes/export.js'
export { registrationWasteRecordsExportByNumber } from './routes/registration-export.js'
export { availableWasteRecordYearsGet } from './routes/available-years.js'
