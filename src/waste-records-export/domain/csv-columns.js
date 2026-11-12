import { uppercaseString } from '#common/helpers/formatters.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  materialFromSpreadsheet,
  metaText
} from '#domain/summary-logs/stored-meta.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

import * as exporter from '#domain/summary-logs/table-schemas/exporter/fields.js'
import * as exporterRegisteredOnly from '#domain/summary-logs/table-schemas/exporter-registered-only/fields.js'
import * as reprocessorInput from '#domain/summary-logs/table-schemas/reprocessor-input/fields.js'
import * as reprocessorOutput from '#domain/summary-logs/table-schemas/reprocessor-output/fields.js'
import * as reprocessorRegisteredOnly from '#domain/summary-logs/table-schemas/reprocessor-registered-only/fields.js'
import * as shared from '#domain/summary-logs/table-schemas/shared/fields.js'

/** @import {AccreditationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Organisation as ReadModelOrganisation, Registration as ReadModelRegistration} from '#organisation-read-model/domain/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {SummaryLogMeta} from '#domain/summary-logs/model.js' */
/** @import {WasteRecordType} from '#domain/waste-records/model.js' */
/** @import {RowClassification} from '#waste-records/repository/schema.js' */
/** @import {Year} from '#common/helpers/dates/year.js' */

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
export const sanitiseFormulaInjection = (cell) =>
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

const YEAR_COLUMN_INDEX = METADATA_COL_INDEX['Accreditation Number'] + 1

/**
 * The metadata prefix with the year after the accreditation number, or as it
 * stands when the export does not show the year.
 *
 * @template T
 * @param {ReadonlyArray<T>} metadata
 * @param {T} year
 * @param {boolean} showYear
 * @returns {T[]}
 */
const withYear = (metadata, year, showYear) =>
  showYear
    ? [
        ...metadata.slice(0, YEAR_COLUMN_INDEX),
        year,
        ...metadata.slice(YEAR_COLUMN_INDEX)
      ]
    : [...metadata]

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
 * @param {{ showYear?: boolean }} [options]
 * @returns {string[]}
 */
export const buildHeaderRow = (dataFieldColumns, { showYear = false } = {}) => [
  ...withYear(METADATA_COLUMNS, 'Year', showYear),
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
 * @param {Record<string, any>} data
 * @param {string[]} dataFieldColumns
 * @returns {(string | number)[]}
 */
const buildDataCells = (data, dataFieldColumns) =>
  dataFieldColumns.map((field) => {
    const value = data[field]
    return value === null || value === undefined ? '' : value
  })

/**
 * @param {ReadModelRegistration} registration
 * @param {string | number | undefined} orsId
 */
const overseasSiteOf = (registration, orsId) =>
  orsId && registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
    ? registration.overseasSites[zeroPadOrsId(orsId)]
    : undefined

/**
 * @typedef {Object} BuildDataRowInput
 * @property {Pick<ReadModelOrganisation, 'name'>} org
 * @property {RegistrationNumber} registrationNumber
 * @property {ReadModelRegistration} registration
 * @property {AccreditationNumber | null} accreditationNumber - The partition's held accreditation, if any.
 * @property {Record<string, any>} data - Coerced committed row data, carrying `processingType`.
 * @property {WasteRecordType} wasteRecordType
 * @property {string} rowId
 * @property {RowClassification} classification - The row's waste-balance classification.
 * @property {{ submittedAt: string } | null | undefined} summaryLogEntry
 * @property {Year} year - The year of the row's ledger.
 * @property {boolean} [showYear]
 * @property {string[]} dataFieldColumns
 */

/**
 * Build a single CSV data row in the same column order as
 * `[...METADATA_COLUMNS, ...dataFieldColumns]`. Numeric data cells stay
 * numbers so they serialise unquoted; string cells are formula-injection
 * sanitised.
 *
 * Inclusion, reasons and tonnage are rendered from the classification the
 * caller supplies; which reading that is — the one stamped at submission or one
 * derived against current context — is the caller's decision.
 *
 * The derived OSR columns (OSR_COUNTRY_REVISED / OSR_NAME_REVISED) sit at the
 * end of the metadata prefix and are the exporter registration's overseas site
 * named by the row's OSR_ID; blank when there is none.
 *
 * @param {BuildDataRowInput} input
 * @returns {(string | number)[]}
 */
export const buildDataRow = ({
  org,
  registrationNumber,
  registration,
  accreditationNumber,
  data,
  wasteRecordType,
  rowId,
  classification,
  summaryLogEntry,
  year,
  showYear = false,
  dataFieldColumns
}) => {
  const site = overseasSiteOf(registration, data.OSR_ID)

  /** @type {(string | number)[]} */
  const metadata = [
    uppercaseString(registration.submittedToRegulator.code),
    org.name,
    registrationNumber,
    registration.material,
    data.processingType,
    accreditationNumber === null ? 'No' : 'Yes',
    accreditationNumber ?? '',
    wasteRecordType,
    summaryLogEntry?.submittedAt ?? '',
    ...buildWasteBalanceCells(classification),
    String(rowId),
    site?.address.country ?? '',
    site?.name ?? ''
  ]

  return [
    ...withYear(metadata, year, showYear),
    ...buildDataCells(data, dataFieldColumns)
  ].map(sanitiseFormulaInjection)
}

/**
 * The metadata prefix of a historical submission's CSV: only columns that
 * read what the submission stored, or the organisation.
 */
export const SUBMISSION_METADATA_COLUMNS = Object.freeze([
  'Regulator',
  'Organisation Name',
  'Registration Number',
  'Material',
  'Operator Processing Type',
  'Accreditation Number',
  'Waste Record Type',
  'Submitted At',
  'Included in Waste Balance',
  'Waste Balance Exclusion Reason',
  'Waste Balance Tonnage',
  'Row ID'
])

/**
 * @param {string[]} dataFieldColumns
 * @returns {string[]}
 */
export const buildSubmissionHeaderRow = (dataFieldColumns) => [
  ...SUBMISSION_METADATA_COLUMNS,
  ...dataFieldColumns
]

/**
 * @typedef {Object} BuildSubmissionDataRowInput
 * @property {Organisation} org
 * @property {Registration} registration
 * @property {SummaryLogMeta | undefined} meta - The submission's stored cover sheet.
 * @property {string} submittedAt
 * @property {Record<string, any>} data - Coerced committed row data, carrying `processingType`.
 * @property {WasteRecordType} wasteRecordType
 * @property {string} rowId
 * @property {RowClassification} classification - The classification stamped at submission.
 * @property {string[]} dataFieldColumns
 */

/**
 * Build a single CSV data row in the column order of
 * `buildSubmissionHeaderRow(dataFieldColumns)`.
 *
 * @param {BuildSubmissionDataRowInput} input
 * @returns {(string | number)[]}
 */
export const buildSubmissionDataRow = ({
  org,
  registration,
  meta,
  submittedAt,
  data,
  wasteRecordType,
  rowId,
  classification,
  dataFieldColumns
}) => {
  const metadata = [
    uppercaseString(registration.submittedToRegulator),
    org.companyDetails.name,
    metaText(meta?.REGISTRATION_NUMBER),
    materialFromSpreadsheet(meta?.MATERIAL) ?? '',
    data.processingType,
    metaText(meta?.ACCREDITATION_NUMBER),
    wasteRecordType,
    submittedAt,
    ...buildWasteBalanceCells(classification),
    String(rowId)
  ]

  return [...metadata, ...buildDataCells(data, dataFieldColumns)].map(
    sanitiseFormulaInjection
  )
}
