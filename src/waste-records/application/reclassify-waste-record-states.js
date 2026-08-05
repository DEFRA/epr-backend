import { classifyRecordForWasteBalance } from '#waste-balances/domain/waste-balance-classification.js'

/**
 * @import {WasteRecordState} from './read-summary-log-row-states.js'
 */

/**
 * @typedef {Object} ReclassificationContext
 * @property {import('#domain/organisations/accreditation.js').Accreditation | null} accreditation
 * @property {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
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
 * The template the row reported under comes from the row itself, so rows
 * classify independently of each other and of the registration's current
 * processing type.
 *
 * @param {WasteRecordState} rowState
 * @param {ReclassificationContext} context
 * @returns {WasteRecordState}
 */
export const reclassifyWasteRecordState = (
  rowState,
  { accreditation, overseasSites }
) => ({
  ...rowState,
  classification: classifyRecordForWasteBalance(
    { type: rowState.wasteRecordType, data: rowState.data },
    rowState.processingType,
    accreditation,
    overseasSites
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
 * @param {ReclassificationContext} context
 * @returns {WasteRecordState[]}
 */
export const reclassifyWasteRecordStates = (rowStates, context) =>
  rowStates.map((rowState) => reclassifyWasteRecordState(rowState, context))
