import { classifyRecordForWasteBalance } from '#waste-balances/domain/waste-balance-classification.js'
import { tableSchemasOf } from '#domain/summary-logs/table-schemas/index.js'

/**
 * @import {WasteRecordState} from './read-summary-log-row-states.js'
 * @import {Year} from '#common/helpers/dates/year.js'
 */

/**
 * @typedef {import('#waste-balances/domain/waste-balance-classification.js').ClassificationContextFor} ReclassificationContext
 */

/**
 * Derive a row state's waste-balance classification against the given context
 * in place of the classification stamped when the row was submitted.
 *
 * A stamped classification records the reading that produced the credit its
 * submission committed, so it is the right answer for reproducing that credit.
 * It is the wrong answer for a question about the present: approving an
 * overseas site or amending an accreditation's validity period changes which
 * rows count, and nothing restates the stored reading until the operator
 * submits again. Reads that answer current-state questions call this so that
 * context changes show up without waiting for a submission.
 *
 * The template the row reported under is the partition's year's template for
 * the row's own processing type, so rows classify independently of each other and of
 * the registration's current processing type.
 *
 * @param {WasteRecordState} rowState
 * @param {Year} year - The year of the row's partition
 * @param {ReclassificationContext} contextFor
 * @returns {WasteRecordState}
 */
export const reclassifyWasteRecordState = (rowState, year, contextFor) => ({
  ...rowState,
  classification: classifyRecordForWasteBalance(
    { type: rowState.wasteRecordType, data: rowState.data },
    contextFor(tableSchemasOf(year, rowState.processingType))
  )
})

/**
 * Reclassify a whole partition's row states against one shared context.
 *
 * Pure — the resolved context is the input, not the repositories it came from,
 * so a caller reading many partitions loads the reference data once for the
 * whole run instead of once per partition.
 *
 * @param {WasteRecordState[]} rowStates
 * @param {Year} year - The year of the partition
 * @param {ReclassificationContext} contextFor
 * @returns {WasteRecordState[]}
 */
export const reclassifyWasteRecordStates = (rowStates, year, contextFor) =>
  rowStates.map((rowState) =>
    reclassifyWasteRecordState(rowState, year, contextFor)
  )
