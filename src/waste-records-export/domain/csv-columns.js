import { isRegistrationAccredited } from '#reports/domain/is-registration-accredited.js'
import { uppercaseString } from '#common/helpers/formatters.js'

import * as exporter from '#domain/summary-logs/table-schemas/exporter/fields.js'
import * as exporterRegisteredOnly from '#domain/summary-logs/table-schemas/exporter-registered-only/fields.js'
import * as reprocessorInput from '#domain/summary-logs/table-schemas/reprocessor-input/fields.js'
import * as reprocessorOutput from '#domain/summary-logs/table-schemas/reprocessor-output/fields.js'
import * as reprocessorRegisteredOnly from '#domain/summary-logs/table-schemas/reprocessor-registered-only/fields.js'
import * as shared from '#domain/summary-logs/table-schemas/shared/fields.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */

export const METADATA_COLUMNS = Object.freeze([
  'Regulator',
  'Organisation Name',
  'Material',
  'Operator Processing Type',
  'Accredited',
  'Waste Record Type',
  'Reported Period',
  'Submitted At',
  'Included in Waste Balance',
  'Row ID'
])

const FIELDS_NEVER_EXPORTED = new Set(['ROW_ID']) // already in metadata prefix

const collectFieldNames = (mod) =>
  Object.values(mod)
    .filter((v) => v && typeof v === 'object')
    .flatMap((v) => Object.values(v))
    .filter((v) => typeof v === 'string')

export const DATA_FIELD_COLUMNS = Object.freeze(
  Array.from(
    new Set(
      [
        exporter,
        exporterRegisteredOnly,
        reprocessorInput,
        reprocessorOutput,
        reprocessorRegisteredOnly,
        shared
      ].flatMap(collectFieldNames)
    )
  )
    .filter((f) => !FIELDS_NEVER_EXPORTED.has(f))
    .sort()
)

export const ALL_COLUMNS = Object.freeze([
  ...METADATA_COLUMNS,
  ...DATA_FIELD_COLUMNS
])

/**
 * @returns {ReadonlyArray<string>}
 */
export const buildHeaderRow = () => ALL_COLUMNS

/**
 * @typedef {Object} BuildDataRowInput
 * @property {Organisation} org
 * @property {Registration} registration
 * @property {WasteRecord} record
 * @property {{ reportingPeriod: string, submittedAt: string } | null | undefined} summaryLogEntry
 * @property {boolean} includedInWasteBalance
 */

/**
 * Build a single CSV data row as an array of cell strings, in the same
 * column order as ALL_COLUMNS.
 *
 * @param {BuildDataRowInput} input
 * @returns {string[]}
 */
export const buildDataRow = ({
  org,
  registration,
  record,
  summaryLogEntry,
  includedInWasteBalance
}) => {
  const accredited = isRegistrationAccredited(registration) ? 'Yes' : 'No'
  const data = record.data

  const metadata = [
    uppercaseString(registration.submittedToRegulator),
    org.companyDetails.name,
    registration.material,
    data.processingType,
    accredited,
    record.type,
    summaryLogEntry?.reportingPeriod ?? '',
    summaryLogEntry?.submittedAt ?? '',
    includedInWasteBalance ? 'true' : 'false',
    String(record.rowId)
  ]

  const dataCells = DATA_FIELD_COLUMNS.map((field) => {
    const value = data[field]
    if (value === null || value === undefined) return ''
    return String(value)
  })

  return [...metadata, ...dataCells]
}
