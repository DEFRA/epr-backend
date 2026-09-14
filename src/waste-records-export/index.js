/**
 * Waste records export module
 *
 * Streams a CSV containing every waste record in the system, with the union
 * of every summary-log field across all schemas plus operator metadata and
 * a boolean indicating waste-balance inclusion.
 *
 * @module waste-records-export
 */

// Route objects only: `plugins/router.js` spreads this module's values
// straight into `server.route()`, so a path constant here crashes boot.
export { wasteRecordsExportRoute } from './routes/export.js'
export { registrationWasteRecordsExport } from './routes/registration-export.js'
