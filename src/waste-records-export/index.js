/**
 * Waste records export module
 *
 * Streams waste records as CSV, with the union of every summary-log field
 * across all schemas plus operator metadata and a boolean indicating
 * waste-balance inclusion. Its README names the module's entry points.
 *
 * @module waste-records-export
 */

export { streamSubmissionCsvToReadable } from './application/stream-submission-csv.js'

export { wasteRecordsExportRoute } from './routes/export.js'
export { registrationWasteRecordsExportByNumber } from './routes/registration-export.js'
export { availableWasteRecordYearsGet } from './routes/available-years.js'
