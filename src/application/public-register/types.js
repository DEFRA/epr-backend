/**
 * @typedef {Object} PublicRegisterRowBase
 * @property {string} type - Waste processing type (e.g., 'Reprocessor', 'Exporter')
 * @property {string} businessName - Business name
 * @property {string} registeredOffice - Registered office address
 * @property {string} appropriateAgency - Appropriate agency (e.g., 'Ea', 'Sepa')
 * @property {string} registrationNumber - Registration number (CBDU number)
 * @property {string} companiesHouseNumber - Companies House Number (empty string if not set)
 * @property {number} orgId - Organisation ID
 * @property {string} tradingName - Trading name (empty string if not set)
 * @property {string} reprocessingSite - Reprocessing site address (empty string if not applicable)
 * @property {string} packagingWasteCategory - Packaging waste category
 * @property {string} annexIIProcess - Annex II process code (e.g., 'R3', 'R4', 'R5')
 * @property {string} accreditationStatus - Accreditation status (empty string if no accreditation)
 * @property {string} accreditationNo - Accreditation number (empty string if no accreditation)
 * @property {string} tonnageBand - Tonnage band (empty string if no accreditation)
 * @property {string} activeDate - Active date in DD/MM/YYYY format (empty string if no accreditation)
 * @property {string} dateLastChanged - Date status last changed in DD/MM/YYYY format (empty string if no accreditation)
 */

/**
 * @typedef {'Jan Report' | 'Feb Report' | 'Mar Report' | 'Apr Report' |
 *           'May Report' | 'Jun Report' | 'Jul Report' | 'Aug Report' |
 *           'Sep Report' | 'Oct Report' | 'Nov Report' | 'Dec Report' |
 *           'Q1 Report' | 'Q2 Report' | 'Q3 Report' | 'Q4 Report'} CompliancePeriodLabel
 */

/**
 * Dynamic compliance fields are keyed by period label (e.g. 'Jan Report', 'Q1 Report').
 * Values: 'DD/MM/YYYY' if submitted, 'N/A' if the period cadence does not apply, '' otherwise.
 *
 * @typedef {PublicRegisterRowBase & Partial<Record<CompliancePeriodLabel, string>>} PublicRegisterRow
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
