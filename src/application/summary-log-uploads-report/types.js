/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */

/**
 * @typedef {Object} SummaryLogUploadReportRow
 * @property {string} appropriateAgency - The regulatory agency (EA, NRW, SEPA, NIEA)
 * @property {string} type - Type of registration (Reprocessor/Exporter)
 * @property {string} businessName - Organisation business name
 * @property {OrganisationNumber} organisationNumber - Organisation number
 * @property {RegistrationNumber} registrationNumber - Registration number
 * @property {AccreditationNumber | ''} accreditationNumber - Accreditation number (empty string if not set)
 * @property {string} reprocessingSite - Registered reprocessing site address (if applicable)
 * @property {string} packagingWasteCategory - Material type
 * @property {string} lastSuccessfulUpload - ISO timestamp of last successful upload or empty string if never succeeded
 * @property {string} lastFailedUpload - ISO timestamp of last failed upload or empty string if never failed
 * @property {number} successfulUploads - Count of successful (submitted) uploads
 * @property {number} failedUploads - Count of failed (rejected/invalid) uploads
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
