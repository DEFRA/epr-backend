import { writeToString } from '@fast-csv/format'
import { Readable } from 'node:stream'

import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { resolveAccreditation } from '#domain/organisations/registration-utils.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import {
  coerceRowData,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { committedRowStatesForRegistration } from '#waste-balances/application/read-committed-row-states.js'
import { latestCommittedSummaryLogId } from '#waste-balances/application/latest-committed-summary-log-id.js'
import {
  buildHeaderRow,
  buildDataRow,
  buildDataFieldColumns
} from '../domain/csv-columns.js'
import { loadSummaryLogMap } from './load-summary-log-map.js'

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {WasteRecordsRepository} from '#repositories/waste-records/port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {WasteBalanceStreamRepository} from '#waste-balances/repository/stream-port.js' */
/** @import {RowStateRepository} from '#waste-balances/repository/row-states-port.js' */

/**
 * @typedef {Object} StreamCsvExportDeps
 * @property {Pick<OrganisationsRepository, 'findAll'>} organisationsRepository
 * @property {Pick<WasteRecordsRepository, 'findDistinctDataKeys'>} wasteRecordsRepository
 * @property {Pick<SummaryLogsRepository, 'findAllByOrgReg'>} summaryLogsRepository
 * @property {WasteBalanceStreamRepository} streamRepository
 * @property {RowStateRepository} rowStateRepository
 */

const sortById = (a, b) => a.id.localeCompare(b.id)

const sortRowStates = (a, b) => {
  const t = a.wasteRecordType.localeCompare(b.wasteRecordType)
  // `numeric: true` gives natural ordering ('9' before '10') while still
  // working for non-numeric rowIds.
  return (
    t ||
    String(a.rowId).localeCompare(String(b.rowId), undefined, {
      numeric: true
    })
  )
}

/**
 * Surface a committed row's data in the schema's canonical types — the same
 * read-time coercion the rest of the system applies. A column that arrives
 * mixed-typed from ExcelJS (a number in one submission, a numeric-string in
 * another) is committed verbatim, so coercing on read is what makes the
 * exported column hold a single type across rows.
 *
 * @param {Record<string, any>} data
 * @param {import('#domain/waste-records/model.js').WasteRecordType} wasteRecordType
 * @returns {Record<string, any>}
 */
const coerceForExport = (data, wasteRecordType) => {
  const schema = findSchemaForProcessingType(
    data?.processingType,
    wasteRecordType
  )
  if (!schema) {
    return data
  }
  return coerceRowData(data, schema).data
}

/**
 * Encode a single row of cells into a CSV-formatted line with trailing newline.
 *
 * @param {ReadonlyArray<string> | string[]} cells
 * @returns {Promise<string>}
 */
const encodeRow = async (cells) => {
  const line = await writeToString([[...cells]], {
    headers: false,
    quoteColumns: true
  })
  return `${line}\n`
}

/**
 * Yield one CSV row per committed row state under a single (org, registration)
 * pair. Inclusion and the row's data are read from the committed state stamped
 * at submission — not recomputed — so the export reflects exactly what counted
 * toward the waste balance when it committed.
 *
 * @param {Object} input
 * @param {Organisation} input.org
 * @param {Registration} input.registration
 * @param {string[]} input.dataFieldColumns
 * @param {WasteBalanceStreamRepository} input.streamRepository
 * @param {RowStateRepository} input.rowStateRepository
 * @param {Pick<SummaryLogsRepository, 'findAllByOrgReg'>} input.summaryLogsRepository
 * @returns {AsyncGenerator<string>}
 */
async function* streamRegistrationRows({
  org,
  registration,
  dataFieldColumns,
  streamRepository,
  rowStateRepository,
  summaryLogsRepository
}) {
  const accreditation = resolveAccreditation(registration, org)
  const accreditationId = accreditation?.id ?? null

  // Every committed row in the snapshot belongs to the head submission, so the
  // head's timestamp is the "Submitted At" column. A registration with no
  // committed submission contributes no rows.
  const head = await latestCommittedSummaryLogId(streamRepository, {
    registrationId: registration.id,
    accreditationId
  })

  if (head === null) {
    return
  }

  const rowStates = await committedRowStatesForRegistration({
    streamRepository,
    rowStateRepository,
    organisationId: org.id,
    registrationId: registration.id,
    accreditationId
  })

  const summaryLogMap = await loadSummaryLogMap(
    summaryLogsRepository,
    org.id,
    registration.id
  )
  const summaryLogEntry = summaryLogMap.get(head) ?? null

  const rowStatesSorted = [...rowStates].sort(sortRowStates)

  for (const rowState of rowStatesSorted) {
    yield await encodeRow(
      buildDataRow({
        org,
        registration,
        accreditation,
        data: coerceForExport(rowState.data, rowState.wasteRecordType),
        wasteRecordType: rowState.wasteRecordType,
        rowId: rowState.rowId,
        summaryLogEntry,
        includedInWasteBalance:
          rowState.classification.outcome === ROW_OUTCOME.INCLUDED,
        dataFieldColumns
      })
    )
  }
}

/**
 * Yields CSV-encoded lines (header first, then one per committed row state).
 * Hard-fails on any iterator error — caller must close the response stream.
 *
 * The header row is dynamically composed from the union of schema-declared
 * field constants and any keys observed on actual `record.data` objects.
 * Observed keys are discovered up-front via a server-side aggregation
 * (`findDistinctDataKeys`) so the export does not need to materialise any
 * waste-record document to compose the header. Rows are then streamed one
 * registration at a time — memory is bounded by the largest single
 * registration's committed-state count, not the total in the system.
 *
 * @param {StreamCsvExportDeps} deps
 * @returns {AsyncGenerator<string>}
 */
export async function* streamCsvExport(deps) {
  const {
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogsRepository,
    streamRepository,
    rowStateRepository
  } = deps

  const [orgs, observedKeys] = await Promise.all([
    organisationsRepository.findAll(),
    wasteRecordsRepository.findDistinctDataKeys()
  ])

  const dataFieldColumns = buildDataFieldColumns(observedKeys)
  yield await encodeRow(buildHeaderRow(dataFieldColumns))

  const orgsSorted = orgs
    .filter((org) => !TEST_ORGANISATIONS.has(org.orgId))
    .sort(sortById)
  for (const org of orgsSorted) {
    const registrations = [...(org.registrations ?? [])].sort(sortById)
    for (const registration of registrations) {
      yield* streamRegistrationRows({
        org,
        registration,
        dataFieldColumns,
        streamRepository,
        rowStateRepository,
        summaryLogsRepository
      })
    }
  }
}

/**
 * Convenience: turn the generator into a Node Readable stream so a Hapi
 * route handler can return it directly.
 *
 * Using `objectMode: false` ensures Hapi treats each yielded string as
 * an HTTP body chunk (rather than as a JavaScript value), which is what
 * `Readable.from` would default to.
 *
 * @param {StreamCsvExportDeps} deps
 * @returns {Readable}
 */
export const streamCsvExportToReadable = (deps) =>
  Readable.from(streamCsvExport(deps), { objectMode: false })
