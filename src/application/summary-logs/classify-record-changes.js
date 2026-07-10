import { isDeepStrictEqual } from 'node:util'

import { markExcludedRecords } from '#waste-balances/application/mark-excluded-records.js'
import { projectSummaryLogRowState } from '#waste-records/application/project-summary-log-row-state.js'
import { RECORD_CHANGE } from './record-change.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {WasteRecordState} from '#waste-records/application/read-summary-log-row-states.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {RecordChange} from './record-change.js' */

/**
 * How a current-upload row changed against the latest submitted summary log,
 * derived by the same comparison the row-state write deduplicates on: project
 * the row through the identical pipeline (mark excluded, then coerce and
 * classify) and compare its content and reading against the submitted row state
 * for the same row identity.
 *
 * A row with no submitted state is added. A row whose projected data and
 * classification both equal the submitted state is unchanged — the write folds
 * it onto the existing document. Any difference in either is adjusted, exactly
 * as a differing projection writes a new state document. Anchoring to the latest
 * submitted state, rather than the last-written waste record, is what removes
 * the phantom adjustments a failed or raced earlier write otherwise produces.
 *
 * @param {{
 *   wasteRecords: ValidatedWasteRecord[],
 *   submittedRowStatesByKey: Map<string, WasteRecordState>,
 *   accreditation: Accreditation | null,
 *   overseasSites: OverseasSitesContext
 * }} params
 * @returns {Map<string, RecordChange>} record change keyed by `${type}:${rowId}`
 */
export const classifyRecordChanges = ({
  wasteRecords,
  submittedRowStatesByKey,
  accreditation,
  overseasSites
}) => {
  const changes = new Map()

  for (const { record } of wasteRecords) {
    const recordKey = `${record.type}:${record.rowId}`
    const submitted = submittedRowStatesByKey.get(recordKey)

    if (!submitted) {
      changes.set(recordKey, RECORD_CHANGE.ADDED)
      continue
    }

    const [marked] = markExcludedRecords([record])
    const projected = projectSummaryLogRowState(
      marked,
      accreditation,
      overseasSites
    )

    const unchanged =
      isDeepStrictEqual(projected.data, submitted.data) &&
      isDeepStrictEqual(projected.classification, submitted.classification)

    changes.set(
      recordKey,
      unchanged ? RECORD_CHANGE.UNCHANGED : RECORD_CHANGE.ADJUSTED
    )
  }

  return changes
}
