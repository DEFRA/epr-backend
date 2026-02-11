/**
 * @typedef {Object} SummaryLogUploadReportRow
 * @property {string} appropriateAgency - The regulatory agency (EA, NRW, SEPA, NIEA)
 * @property {string} type - Type of registration (Reprocessor/Exporter)
 * @property {string} businessName - Organisation business name
 * @property {number} orgId - Organisation ID
 * @property {string} registrationNumber - Registration number (empty string if not set)
 * @property {string} accreditationNumber - Accreditation number (empty string if not set)
 * @property {string} reprocessingSite - Registered reprocessing site address (if applicable)
 * @property {string} packagingWasteCategory - Material type
 * @property {string} lastSuccessfulUpload - ISO timestamp of last successful upload or empty string if never succeeded
 * @property {string} lastFailedUpload - ISO timestamp of last failed upload or empty string if never failed
 * @property {number} successfulUploads - Count of successful (submitted) uploads
 * @property {number} failedUploads - Count of failed (rejected/invalid) uploads
 */

export default {}
