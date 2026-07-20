import { classifyRecordForWasteBalance } from '#waste-balances/domain/waste-balance-classification.js'

/**
 * @import {WasteRecordState} from './read-summary-log-row-states.js'
 */

/**
 * @typedef {Object} ReclassificationContext
 * @property {import('#domain/summary-logs/meta-fields.js').ProcessingType} processingType
 * @property {import('#domain/organisations/accreditation.js').Accreditation | null} accreditation
 * @property {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 */

/**
 * Re-derive each row's waste-balance classification against the given context,
 * in place of the classification stamped when the row was submitted.
 *
 * A stamped classification records the reading that produced the credit its
 * submission committed, so it is the right answer for reproducing that credit.
 * It is the wrong answer for a question about the present: approving an
 * overseas site or amending an accreditation's validity period changes which
 * rows count, and nothing restates the stored reading until the operator
 * submits again — which, for an accreditation that has finished submitting for
 * the year, may be never. Reads that answer current-state questions call this
 * so that context changes show up without waiting for a submission.
 *
 * The rows come back in the shape consumers already receive, so a consumer
 * moves from stamped to live readings by changing which function it calls.
 *
 *
 * @param {WasteRecordState[]} states
 * @param {ReclassificationContext} context
 * @returns {WasteRecordState[]}
 */
export const reclassifyWasteRecordStates = (
  states,
  { processingType, accreditation, overseasSites }
) =>
  states.map((state) => ({
    ...state,
    classification: classifyRecordForWasteBalance(
      /** @type {*} */ ({
        rowId: state.rowId,
        type: state.wasteRecordType,
        data: state.data
      }),
      processingType,
      accreditation,
      overseasSites
    )
  }))
