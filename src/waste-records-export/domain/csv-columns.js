import { uppercaseString } from '#common/helpers/formatters.js'
import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'

import * as exporter from '#domain/summary-logs/table-schemas/exporter/fields.js'
import * as exporterRegisteredOnly from '#domain/summary-logs/table-schemas/exporter-registered-only/fields.js'
import * as reprocessorInput from '#domain/summary-logs/table-schemas/reprocessor-input/fields.js'
import * as reprocessorOutput from '#domain/summary-logs/table-schemas/reprocessor-output/fields.js'
import * as reprocessorRegisteredOnly from '#domain/summary-logs/table-schemas/reprocessor-registered-only/fields.js'
import * as shared from '#domain/summary-logs/table-schemas/shared/fields.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecordType} from '#domain/waste-records/model.js' */

export const METADATA_COLUMNS = Object.freeze([
  'Regulator',
  'Organisation Name',
  'Registration Number',
  'Material',
  'Operator Processing Type',
  'Accredited',
  'Accreditation Number',
  'Waste Record Type',
  'Submitted At',
  'Included in Waste Balance',
  'Row ID'
])

// Both fields are already rendered in the metadata prefix:
//   ROW_ID            -> 'Row ID'
//   processingType    -> 'Operator Processing Type'
// `findDistinctDataKeys` surfaces every key on `record.data`, including
// `processingType`, so exclude them here to avoid duplicate columns.
const FIELDS_NEVER_EXPORTED = new Set(['ROW_ID', 'processingType'])

const collectFieldNames = (mod) =>
  Object.values(mod)
    .filter((v) => v && typeof v === 'object')
    .flatMap((v) => Object.values(v))
    .filter((v) => typeof v === 'string')

/**
 * Field names declared in any summary-log table-schema's *_FIELDS constant.
 * Used as the baseline column set; runtime-observed keys are unioned on top
 * to capture template columns that have no FIELD constant in code.
 */
export const SCHEMA_FIELD_NAMES = Object.freeze(
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
  ).filter((f) => !FIELDS_NEVER_EXPORTED.has(f))
)

/**
 * Compute the data-field column list by unioning the schema-declared FIELD
 * constants with any keys observed at runtime on actual `record.data` objects.
 *
 * The schema baseline ensures all known templates have stable columns even
 * when no records exist for them yet. The observed-keys union picks up
 * template columns that exist in spreadsheets but are not declared in any
 * `*_FIELDS` constant (e.g. `WASTE_TRANSFER_NOTE`,
 * `BILL_OF_LANDING_REFERENCE_NUMBER`).
 *
 * @param {Iterable<string>} observedKeys
 * @returns {string[]}
 */
export const buildDataFieldColumns = (observedKeys) => {
  const all = new Set(SCHEMA_FIELD_NAMES)
  for (const key of observedKeys) {
    if (!FIELDS_NEVER_EXPORTED.has(key)) {
      all.add(key)
    }
  }
  return Array.from(all).sort((a, b) => a.localeCompare(b))
}

/**
 * Compose the full header row from the dynamic data-field columns.
 *
 * @param {string[]} dataFieldColumns
 * @returns {string[]}
 */
export const buildHeaderRow = (dataFieldColumns) => [
  ...METADATA_COLUMNS,
  ...dataFieldColumns
]

/**
 * @typedef {Object} BuildDataRowInput
 * @property {Organisation} org
 * @property {Registration} registration
 * @property {Accreditation | null} accreditation
 * @property {Record<string, any>} data
 * @property {WasteRecordType} wasteRecordType
 * @property {string} rowId
 * @property {{ submittedAt: string } | null | undefined} summaryLogEntry
 * @property {boolean} includedInWasteBalance
 * @property {string[]} dataFieldColumns
 */

/**
 * Build a single CSV data row as an array of cell strings, in the same
 * column order as `[...METADATA_COLUMNS, ...dataFieldColumns]`.
 *
 * @param {BuildDataRowInput} input
 * @returns {string[]}
 */
export const buildDataRow = ({
  org,
  registration,
  accreditation,
  data,
  wasteRecordType,
  rowId,
  summaryLogEntry,
  includedInWasteBalance,
  dataFieldColumns
}) => {
  const accredited = accreditation !== null ? 'Yes' : 'No'

  const metadata = [
    uppercaseString(registration.submittedToRegulator),
    org.companyDetails.name,
    registration.registrationNumber ?? '',
    resolveDetailedMaterial(registration),
    data.processingType,
    accredited,
    accreditation?.accreditationNumber ?? '',
    wasteRecordType,
    summaryLogEntry?.submittedAt ?? '',
    includedInWasteBalance ? 'true' : 'false',
    String(rowId)
  ]

  const dataCells = dataFieldColumns.map((field) => {
    const value = data[field]
    if (value === null || value === undefined) {
      return ''
    }
    return String(value)
  })

  return [...metadata, ...dataCells]
}
