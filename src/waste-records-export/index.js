/**
 * Waste records export module
 *
 * Streams a CSV containing every waste record in the system, with the union
 * of every summary-log field across all schemas plus operator metadata and
 * a boolean indicating waste-balance inclusion.
 *
 * @module waste-records-export
 */

export { wasteRecordsExportRoute } from './routes/export.js'
