import { VERSION_STATUS } from '#domain/waste-records/model.js'

/**
 * @typedef {import('./validate.js').ValidatedWasteRecord} ValidatedWasteRecord
 * @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue
 */

/**
 * @typedef {Object} LoadCategory
 * @property {number} count - Total count of loads
 * @property {string[]} rowIds - Row IDs (truncated to MAX_ROW_IDS)
 */

/**
 * @typedef {Object} LoadValidity
 * @property {LoadCategory} valid - Valid loads (no issues)
 * @property {LoadCategory} invalid - Invalid loads (has issues)
 * @property {LoadCategory} included - Loads included in Waste Balance calculation
 * @property {LoadCategory} excluded - Loads excluded from Waste Balance calculation
 */

/**
 * @typedef {Object} Loads
 * @property {LoadValidity} added - Loads added in this upload
 * @property {LoadValidity} unchanged - Loads unchanged from previous uploads
 * @property {LoadValidity} adjusted - Loads adjusted in this upload
 */

const MAX_ROW_IDS = 100

/**
 * Creates a fresh empty load category
 *
 * @returns {LoadCategory}
 */
export const createEmptyLoadCategory = () => ({ count: 0, rowIds: [] })

/**
 * Creates a fresh empty load validity structure
 *
 * @returns {LoadValidity}
 */
export const createEmptyLoadValidity = () => ({
  valid: createEmptyLoadCategory(),
  invalid: createEmptyLoadCategory(),
  included: createEmptyLoadCategory(),
  excluded: createEmptyLoadCategory()
})

/**
 * Creates an empty loads structure
 *
 * @returns {Loads}
 */
export const createEmptyLoads = () => ({
  added: createEmptyLoadValidity(),
  unchanged: createEmptyLoadValidity(),
  adjusted: createEmptyLoadValidity()
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
 * Inclusion:
 * - included: Load has outcome 'INCLUDED' from validation pipeline
 * - excluded: Load has outcome 'EXCLUDED' or 'REJECTED' from validation pipeline
 *
 * Row ID arrays are truncated to 100 entries; totals always reflect the full count.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - Array of waste records with validation issues and outcome
 * @param {string} params.summaryLogId - The current summary log ID
 * @returns {Loads} Row IDs grouped by classification and validity
 */
export const classifyLoads = ({ wasteRecords, summaryLogId }) => {
  const loads = createEmptyLoads()

  for (const { record, issues, outcome } of wasteRecords) {
    const classification = classifyRecord(record, summaryLogId)
    const validityKey = issues.length > 0 ? 'invalid' : 'valid'
    const validityCategory = loads[classification][validityKey]

    validityCategory.count++
    if (validityCategory.rowIds.length < MAX_ROW_IDS) {
      validityCategory.rowIds.push(record.rowId)
    }

    // Included/excluded classification based on outcome from validation pipeline
    const inclusionKey = outcome === 'INCLUDED' ? 'included' : 'excluded'
    const inclusionCategory = loads[classification][inclusionKey]

    inclusionCategory.count++
    if (inclusionCategory.rowIds.length < MAX_ROW_IDS) {
      inclusionCategory.rowIds.push(record.rowId)
    }
  }

  return loads
}
