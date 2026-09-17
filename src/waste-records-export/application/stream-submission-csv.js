import { Readable } from 'node:stream'

import {
  buildDataFieldColumns,
  buildSubmissionDataRow,
  buildSubmissionHeaderRow
} from '../domain/csv-columns.js'
import {
  coerceForExport,
  encodeRow,
  sortRowStates
} from './stream-csv-export.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {SummaryLogMeta} from '#domain/summary-logs/model.js' */
/** @import {SummaryLogRowState} from '#waste-records/repository/schema.js' */

/**
 * @typedef {Object} SubmissionCsvInput
 * @property {Organisation} org
 * @property {Registration} registration
 * @property {SummaryLogMeta | undefined} meta
 * @property {string} submittedAt
 * @property {SummaryLogRowState[]} rowStates
 */

/**
 * Registered-only (null accreditation) rows first, then accreditation ids
 * ascending, then type and natural row id.
 *
 * @param {SummaryLogRowState} a
 * @param {SummaryLogRowState} b
 * @returns {number}
 */
const sortSubmissionRowStates = (a, b) =>
  String(a.accreditationId ?? '').localeCompare(
    String(b.accreditationId ?? '')
  ) || sortRowStates(a, b)

/**
 * Yields CSV-encoded lines (header first, then one per row state) for one
 * submission, from what the caller has already read. Its header data columns
 * come from this submission's rows only.
 *
 * @param {SubmissionCsvInput} input
 * @returns {AsyncGenerator<string>}
 */
export async function* streamSubmissionCsv({
  org,
  registration,
  meta,
  submittedAt,
  rowStates
}) {
  const dataFieldColumns = buildDataFieldColumns(
    new Set(rowStates.flatMap((rowState) => Object.keys(rowState.data)))
  )
  yield await encodeRow(buildSubmissionHeaderRow(dataFieldColumns))

  for (const rowState of [...rowStates].sort(sortSubmissionRowStates)) {
    yield await encodeRow(
      buildSubmissionDataRow({
        org,
        registration,
        meta,
        submittedAt,
        data: coerceForExport(rowState),
        wasteRecordType: rowState.wasteRecordType,
        rowId: rowState.rowId,
        classification: rowState.classification,
        dataFieldColumns
      })
    )
  }
}

/**
 * @param {SubmissionCsvInput} input
 * @returns {Readable}
 */
export const streamSubmissionCsvToReadable = (input) =>
  Readable.from(streamSubmissionCsv(input), { objectMode: false })
