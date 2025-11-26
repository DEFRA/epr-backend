import { VERSION_STATUS } from '#domain/waste-records/model.js'

/**
 * @typedef {import('#application/waste-records/transform-from-summary-log.js').ValidatedWasteRecord} ValidatedWasteRecord
 * @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue
 */

/**
 * @typedef {Object} ValidityCount
 * @property {number} valid - Count of valid loads
 * @property {number} invalid - Count of invalid loads
 */

/**
 * @typedef {Object} LoadCounts
 * @property {ValidityCount} new - Counts for new loads
 * @property {ValidityCount} unchanged - Counts for unchanged loads
 * @property {ValidityCount} adjusted - Counts for adjusted loads
 */

/**
 * Creates an empty load counts structure
 *
 * @returns {LoadCounts}
 */
const createEmptyLoadCounts = () => ({
  new: { valid: 0, invalid: 0 },
  unchanged: { valid: 0, invalid: 0 },
  adjusted: { valid: 0, invalid: 0 }
})

/**
 * Determines the classification for a transformed record
 *
 * Classification is based on whether a version was added in this upload:
 * - new: Record was created in this upload (1 version, status CREATED, matching summaryLogId)
 * - adjusted: Record had a version added in this upload (last version has status UPDATED and matching summaryLogId)
 * - unchanged: No version was added in this upload
 *
 * @param {ValidatedWasteRecord['record']} record - The waste record
 * @param {string} summaryLogId - The current summary log ID
 * @returns {'new'|'unchanged'|'adjusted'} The classification
 */
const classifyRecord = (record, summaryLogId) => {
  const lastVersion = record.versions[record.versions.length - 1]

  // Check if the last version was created in this upload
  if (lastVersion.summaryLog?.id !== summaryLogId) {
    return 'unchanged'
  }

  // Version was added in this upload - determine if new or adjusted
  return lastVersion.status === VERSION_STATUS.CREATED ? 'new' : 'adjusted'
}

/**
 * Classifies loads from transformed records and returns counts
 *
 * Classification dimensions:
 * - new: Load was created in this upload
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
 * @returns {LoadCounts} Counts of loads by classification
 */
export const classifyLoads = ({ wasteRecords, summaryLogId }) => {
  const counts = createEmptyLoadCounts()

  for (const { record, issues } of wasteRecords) {
    const classification = classifyRecord(record, summaryLogId)
    const validityKey = issues.length > 0 ? 'invalid' : 'valid'
    counts[classification][validityKey]++
  }

  return counts
}
