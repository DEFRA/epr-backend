import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

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
 * @typedef {Object} ValidityCounts
 * @property {LoadCategory} valid - Valid loads (no issues)
 * @property {LoadCategory} invalid - Invalid loads (has issues)
 */

/**
 * @typedef {Object} InclusionCounts
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

const createEmptyValidationResults = () => ({
  added: {
    valid: createEmptyLoadCategory(),
    invalid: createEmptyLoadCategory()
  },
  unchanged: {
    valid: createEmptyLoadCategory(),
    invalid: createEmptyLoadCategory()
  },
  adjusted: {
    valid: createEmptyLoadCategory(),
    invalid: createEmptyLoadCategory()
  }
})

const createEmptyClassificationResults = () => ({
  added: {
    included: createEmptyLoadCategory(),
    excluded: createEmptyLoadCategory()
  },
  unchanged: {
    included: createEmptyLoadCategory(),
    excluded: createEmptyLoadCategory()
  },
  adjusted: {
    included: createEmptyLoadCategory(),
    excluded: createEmptyLoadCategory()
  }
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
const determineRecordStatus = (record, summaryLogId) => {
  const lastVersion = record.versions[record.versions.length - 1]

  // Check if the last version was created in this upload
  if (lastVersion.summaryLog?.id !== summaryLogId) {
    return 'unchanged'
  }

  // Version was added in this upload - determine if added or adjusted
  return lastVersion.status === VERSION_STATUS.CREATED ? 'added' : 'adjusted'
}

/**
 * Increments a load category's count and appends the rowId (up to MAX_ROW_IDS)
 *
 * @param {LoadCategory} category - The category to increment
 * @param {string} rowId - The row ID to append
 */
const incrementCategory = (category, rowId) => {
  category.count++
  if (category.rowIds.length < MAX_ROW_IDS) {
    category.rowIds.push(rowId)
  }
}

/**
 * Counts validation results (valid/invalid) for ALL rows, grouped by record status.
 * Skips IGNORED rows.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - All waste records (all tables)
 * @param {string} params.summaryLogId - The current summary log ID
 * @returns {{ added: ValidityCounts, unchanged: ValidityCounts, adjusted: ValidityCounts }}
 */
export const countByValidity = ({ wasteRecords, summaryLogId }) => {
  const results = createEmptyValidationResults()

  for (const { record, issues, outcome } of wasteRecords) {
    if (outcome === ROW_OUTCOME.IGNORED) {
      continue
    }

    const classification = determineRecordStatus(record, summaryLogId)
    const validityKey =
      /** @type {ValidationIssue[]} */ (issues).length > 0 ? 'invalid' : 'valid'

    incrementCategory(results[classification][validityKey], record.rowId)
  }

  return results
}

/**
 * Classifies loads by included/excluded for waste-balance table rows only.
 * Skips IGNORED rows.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - Waste-balance table records only
 * @param {string} params.summaryLogId - The current summary log ID
 * @returns {{ added: InclusionCounts, unchanged: InclusionCounts, adjusted: InclusionCounts }}
 */
export const countByWasteBalanceInclusion = ({
  wasteRecords,
  summaryLogId
}) => {
  const results = createEmptyClassificationResults()

  for (const { record, outcome } of wasteRecords) {
    if (outcome === ROW_OUTCOME.IGNORED) {
      continue
    }

    const classification = determineRecordStatus(record, summaryLogId)
    const inclusionKey =
      outcome === ROW_OUTCOME.INCLUDED ? 'included' : 'excluded'

    incrementCategory(results[classification][inclusionKey], record.rowId)
  }

  return results
}

/**
 * Merges validation results (valid/invalid) and classification results (included/excluded)
 * into the full Loads structure.
 *
 * @param {{ added: ValidityCounts, unchanged: ValidityCounts, adjusted: ValidityCounts }} validationResults
 * @param {{ added: InclusionCounts, unchanged: InclusionCounts, adjusted: InclusionCounts }} classificationResults
 * @returns {Loads}
 */
export const mergeLoads = (validationResults, classificationResults) => ({
  added: { ...validationResults.added, ...classificationResults.added },
  unchanged: {
    ...validationResults.unchanged,
    ...classificationResults.unchanged
  },
  adjusted: { ...validationResults.adjusted, ...classificationResults.adjusted }
})
