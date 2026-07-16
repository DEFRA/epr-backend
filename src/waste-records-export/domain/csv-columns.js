import { uppercaseString } from '#common/helpers/formatters.js'
import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

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
/** @import {RowClassification} from '#waste-records/repository/schema.js' */

const FORMULA_INJECTION_PREFIX = /^[=+\-@]/

const ORS_ID_DIGITS = 3

/**
 * Zero-pad an OSR_ID to the 3-digit form used as the overseas-sites context
 * key (e.g. `1` -> `'001'`). Mirrors the report aggregation lookup so both
 * paths resolve the same site for a given record.
 *
 * @param {string | number} orsId
 * @returns {string}
 */
const zeroPadOrsId = (orsId) => String(orsId).padStart(ORS_ID_DIGITS, '0')

/**
 * Derived export columns computed from the approved overseas-sites data
 * (looked up by the record's OSR_ID) rather than from the unreliable
 * user-entered summary-log values. Emitted as part of the metadata prefix
 * (see `METADATA_COLUMNS`), the same way as the waste-balance columns — hence
 * the spaced, Title Case headers that distinguish them from the
 * SCREAMING_SNAKE data-field columns.
 */
export const OSR_COUNTRY_REVISED = 'OSR Country Revised'
export const OSR_NAME_REVISED = 'OSR Name Revised'

/**
 * Prefix a string cell that opens with =, +, - or @ with an apostrophe so
 * spreadsheet software treats it as literal text rather than a formula.
 * Numeric cells pass through untouched so genuine numbers stay numeric.
 *
 * @param {string | number} cell
 * @returns {string | number}
 */
const sanitiseFormulaInjection = (cell) =>
  typeof cell === 'string' && FORMULA_INJECTION_PREFIX.test(cell)
    ? `'${cell}`
    : cell

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
  'Waste Balance Exclusion Reason',
  'Waste Balance Tonnage',
  'Row ID',
  OSR_COUNTRY_REVISED,
  OSR_NAME_REVISED
])

export const METADATA_COL_INDEX = Object.freeze(
  Object.fromEntries(METADATA_COLUMNS.map((name, i) => [name, i]))
)

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
 * Compose the full header row from the fixed metadata prefix and the dynamic
 * data-field columns.
 *
 * @param {string[]} dataFieldColumns
 * @returns {string[]}
 */
export const buildHeaderRow = (dataFieldColumns) => [
  ...METADATA_COLUMNS,
  ...dataFieldColumns
]

const formatReason = (r) => (r.field ? `${r.code}: ${r.field}` : r.code)

// A NOT_APPLICABLE outcome stamps a row whose registration or template carries
// no per-row waste-balance decision at all (no accreditation, registered-only
// template, no classification schema) — rendered as "NA" rather than a reason.
// INCLUDED carries its contributed tonnage; EXCLUDED carries its reason codes.
const buildWasteBalanceCells = (classification) => {
  if (classification.outcome === WASTE_BALANCE_OUTCOME.NOT_APPLICABLE) {
    return ['NA', '', '']
  }
  if (classification.outcome === WASTE_BALANCE_OUTCOME.INCLUDED) {
    return ['true', '', classification.transactionAmount]
  }
  return ['false', classification.reasons.map(formatReason).join('; '), '']
}

/**
 * @typedef {Object} BuildDataRowInput
 * @property {Organisation} org
 * @property {Registration} registration
 * @property {Accreditation | null} accreditation
 * @property {Record<string, any>} data - Coerced committed row data, carrying `processingType`.
 * @property {WasteRecordType} wasteRecordType
 * @property {string} rowId
 * @property {RowClassification} classification - The row's stamped waste-balance classification.
 * @property {{ submittedAt: string } | null | undefined} summaryLogEntry
 * @property {Record<string, import('./overseas-sites-context.js').OverseasSiteContextEntry>} [overseasSites]
 * @property {string[]} dataFieldColumns
 */

/**
 * Build a single CSV data row in the same column order as
 * `[...METADATA_COLUMNS, ...dataFieldColumns]`. Numeric data cells stay
 * numbers so they serialise unquoted; string cells are formula-injection
 * sanitised.
 *
 * Inclusion, reasons and tonnage come from the classification stamped on the
 * row state when its summary log was submitted — not recomputed — so the export
 * reflects exactly what counted toward the waste balance at submission.
 *
 * The derived OSR columns (OSR_COUNTRY_REVISED / OSR_NAME_REVISED) sit at the
 * end of the metadata prefix and are looked up from the approved
 * overseas-sites context by the row's OSR_ID. They are blank when the row has
 * no OSR_ID or no matching approved site is found — which also leaves them
 * blank for reprocessor rows, whose registrations carry no overseas sites.
 *
 * @param {BuildDataRowInput} input
 * @returns {(string | number)[]}
 */
export const buildDataRow = ({
  org,
  registration,
  accreditation,
  data,
  wasteRecordType,
  rowId,
  classification,
  summaryLogEntry,
  overseasSites,
  dataFieldColumns
}) => {
  const accredited = accreditation !== null ? 'Yes' : 'No'

  const orsDetails = data.OSR_ID
    ? overseasSites?.[zeroPadOrsId(data.OSR_ID)]
    : undefined

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
    ...buildWasteBalanceCells(classification),
    String(rowId),
    orsDetails?.country ?? '',
    orsDetails?.siteName ?? ''
  ]

  const dataCells = dataFieldColumns.map((field) => {
    const value = data[field]
    return value === null || value === undefined ? '' : value
  })

  return [...metadata, ...dataCells].map(sanitiseFormulaInjection)
}
