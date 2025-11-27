import { VERSION_STATUS } from '#domain/waste-records/model.js'

/**
 * @typedef {import('./validate.js').ValidatedWasteRecord} ValidatedWasteRecord
 * @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue
 */

/**
 * @typedef {Object} LoadRowIds
 * @property {string[]} valid - Row IDs for valid loads
 * @property {string[]} invalid - Row IDs for invalid loads
 */

/**
 * @typedef {Object} Loads
 * @property {LoadRowIds} added - Row IDs for added loads
 * @property {LoadRowIds} unchanged - Row IDs for unchanged loads
 * @property {LoadRowIds} adjusted - Row IDs for adjusted loads
 */

/**
 * Creates an empty loads structure
 *
 * @returns {Loads}
 */
const createEmptyLoads = () => ({
  added: { valid: [], invalid: [] },
  unchanged: { valid: [], invalid: [] },
  adjusted: { valid: [], invalid: [] }
})

/**
 * Determines the classification for a transformed record
 *
 * Classification is based on whether a version was added in this upload:
 * - added: Record was created in this upload (1 version, status CREATED, matching summaryLogId)
 * - adjusted: Record had a version added in this upload (last version has status UPDATED and matching summaryLogId)
 * - unchanged: No version was added in this upload
 *
 * @param {ValidatedWasteRecord['record']} record - The waste record
 * @param {string} summaryLogId - The current summary log ID
 * @returns {'added'|'unchanged'|'adjusted'} The classification
 */
const classifyRecord = (record, summaryLogId) => {
  const lastVersion = record.versions[record.versions.length - 1]

  // Check if the last version was created in this upload
  if (lastVersion.summaryLog?.id !== summaryLogId) {
    return 'unchanged'
  }

  // Version was added in this upload - determine if added or adjusted
  return lastVersion.status === VERSION_STATUS.CREATED ? 'added' : 'adjusted'
}

/**
 * Classifies loads from transformed records and returns row IDs grouped by classification
 *
 * Classification dimensions:
 * - added: Load was created in this upload
 * - unchanged: Load existed before and wasn't modified in this upload
 * - adjusted: Load existed before and was modified in this upload
 *
 * Validity:
 * - valid: Load passes all validation rules (issues.length === 0)
 * - invalid: Load has validation errors (issues.length > 0)
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - Array of waste records with validation issues
 * @param {string} params.summaryLogId - The current summary log ID
 * @returns {Loads} Row IDs grouped by classification and validity
 */
export const classifyLoads = ({ wasteRecords, summaryLogId }) => {
  const loads = createEmptyLoads()

  for (const { record, issues } of wasteRecords) {
    const classification = classifyRecord(record, summaryLogId)
    const validityKey = issues.length > 0 ? 'invalid' : 'valid'
    loads[classification][validityKey].push(record.rowId)
  }

  return loads
}
