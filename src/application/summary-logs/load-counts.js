import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { RECORD_CHANGE, determineRecordStatus } from './record-change.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */

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

const emptyValidityBucket = () => ({
  valid: createEmptyLoadCategory(),
  invalid: createEmptyLoadCategory()
})

const emptyInclusionBucket = () => ({
  included: createEmptyLoadCategory(),
  excluded: createEmptyLoadCategory()
})

/**
 * Returns a new load category with the rowId added (up to MAX_ROW_IDS)
 *
 * @param {LoadCategory} category - The existing category
 * @param {string} rowId - The row ID to append
 * @returns {LoadCategory}
 */
const addToCategory = (category, rowId) => ({
  count: category.count + 1,
  rowIds:
    category.rowIds.length < MAX_ROW_IDS
      ? [...category.rowIds, rowId]
      : category.rowIds
})

/**
 * Counts validation results (valid/invalid) for ALL rows, grouped by record status.
 * Skips IGNORED rows.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - All waste records (all tables)
 * @param {string} params.summaryLogId - The current summary log ID
 * @returns {{ added: ValidityCounts, unchanged: ValidityCounts, adjusted: ValidityCounts }}
 */
export const countByValidity = ({ wasteRecords, summaryLogId }) =>
  wasteRecords
    .filter((wr) => wr.outcome !== ROW_OUTCOME.IGNORED)
    .reduce(
      (acc, { record, issues }) => {
        const status = determineRecordStatus(record, summaryLogId)
        const key =
          /** @type {ValidationIssue[]} */ (issues).length > 0
            ? 'invalid'
            : 'valid'
        return {
          ...acc,
          [status]: {
            ...acc[status],
            [key]: addToCategory(acc[status][key], record.rowId)
          }
        }
      },
      {
        added: emptyValidityBucket(),
        unchanged: emptyValidityBucket(),
        adjusted: emptyValidityBucket()
      }
    )

/**
 * Classifies loads by included/excluded for waste-balance table rows only.
 * IGNORED rows are counted as excluded for added and adjusted loads.
 * IGNORED unchanged loads are skipped — re-uploaded with no data change, so no new user action to surface.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - Waste-balance table records only
 * @param {string} params.summaryLogId - The current summary log ID
 * @returns {{ added: InclusionCounts, unchanged: InclusionCounts, adjusted: InclusionCounts }}
 */
export const countByWasteBalanceInclusion = ({ wasteRecords, summaryLogId }) =>
  wasteRecords.reduce(
    (acc, { record, outcome }) => {
      const status = determineRecordStatus(record, summaryLogId)
      if (
        outcome === ROW_OUTCOME.IGNORED &&
        status === RECORD_CHANGE.UNCHANGED
      ) {
        return acc
      }
      const key = outcome === ROW_OUTCOME.INCLUDED ? 'included' : 'excluded'
      return {
        ...acc,
        [status]: {
          ...acc[status],
          [key]: addToCategory(acc[status][key], record.rowId)
        }
      }
    },
    {
      added: emptyInclusionBucket(),
      unchanged: emptyInclusionBucket(),
      adjusted: emptyInclusionBucket()
    }
  )

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
