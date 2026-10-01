/**
 * The reported-data comparison core, used by the resubmission-figures
 * diagnostic and intended for the planned validation-time resubmission gate.
 *
 * `REPORTED_DATA_FIELDS` classifies every field in `reportDataFieldsSchema`
 * (the report's data fields, not its identity, period or lifecycle fields) as
 * compared exactly, compared as free text, or excluded (with the reason it is
 * excluded), and `diffReports` compares two reports on the compared fields.
 * The classification is exhaustive by test: a field added to
 * `reportDataFieldsSchema` fails the build until it is classified here, so a
 * new reported figure added there can never be silently left out of the
 * comparison.
 *
 * A field is compared only when a summary-log upload can change it. Fields
 * entered in the reporting journey, PRN data and values resolved from the ORS
 * registry are excluded: a change to them is not a change the upload made.
 *
 * Free-text fields are the ones an operator types (supplier and destination
 * names and addresses). By the contract, casing, whitespace and
 * blank-versus-null edits to them are not reported-data changes, so they are
 * normalised on extraction. Figures, identifiers and dropdown values are
 * compared exactly.
 *
 * List entries that compare equal once normalised and stripped of excluded
 * fields are merged, their `summed` tonnage added. The aggregation groups rows
 * on raw values (including supplier contact details), so editing one of several
 * rows for the same supplier splits its entry in two; merged again, the report
 * presents the same data.
 *
 * Absent and null compared fields both extract as null. A missing activity block
 * also extracts as null, so present-vs-absent is itself a difference.
 *
 * `canonicalise` sorts object keys and array elements, so the comparison is
 * insensitive to both key order and row order. It rejects anything that is not
 * plain JSON rather than serialising it ambiguously.
 */

import { add, toNumber } from '#common/helpers/decimal-utils.js'

/** @import { RecyclingActivity, ExportActivity, WasteSent } from '#reports/repository/port.js' */

/**
 * A report (or submission) carrying the reported-data activity blocks.
 *
 * @typedef {Object} ReportedDataBearingReport
 * @property {RecyclingActivity} [recyclingActivity]
 * @property {ExportActivity} [exportActivity]
 * @property {WasteSent} [wasteSent]
 */

/**
 * @typedef {{ excluded: string }} ExcludedField
 */

/**
 * How one report field takes part in the comparison: compared exactly,
 * compared as free text, a list item's tonnage (compared exactly, summed when
 * equal items merge), excluded with a reason, a one-entry array whose entry
 * classifies each item, or an object that classifies each of its fields.
 *
 * @typedef {'exact' | 'text' | 'summed' | ExcludedField | [FieldSpec] | { [field: string]: FieldSpec }} FieldSpec
 */

/**
 * @typedef {null | boolean | number | string | ReportedDataValue[] | { [field: string]: ReportedDataValue }} ReportedDataValue
 */

const EXACT = 'exact'
const TEXT = 'text'
const SUMMED = 'summed'

/**
 * @param {string} reason
 * @returns {ExcludedField}
 */
const excluded = (reason) => ({ excluded: reason })

const OPERATOR_ENTERED =
  'Entered by the operator in the reporting journey, not derived from the summary log'

const SUPPLIER_CONTACT =
  'Agreed exception: a change only to a supplier contact detail does not require resubmission'

const ORS_REGISTRY =
  'Resolved from the ORS registry by orsId, not the summary log: a registry update between submissions is not a reported-data change'

/**
 * Every field in `reportDataFieldsSchema`, classified. See the module comment.
 *
 * @type {{ [field: string]: FieldSpec }}
 */
export const REPORTED_DATA_FIELDS = {
  source: excluded('Provenance: changes on every upload'),
  recyclingActivity: {
    suppliers: [
      {
        supplierName: TEXT,
        // An unvalidated supplementary column, so effectively operator text
        facilityType: TEXT,
        supplierAddress: TEXT,
        supplierPhone: excluded(SUPPLIER_CONTACT),
        supplierEmail: excluded(SUPPLIER_CONTACT),
        tonnageReceived: SUMMED
      }
    ],
    totalTonnageReceived: EXACT,
    tonnageRecycled: excluded(OPERATOR_ENTERED),
    tonnageNotRecycled: excluded(OPERATOR_ENTERED)
  },
  exportActivity: {
    overseasSites: [
      {
        orsId: EXACT,
        siteName: excluded(ORS_REGISTRY),
        country: excluded(ORS_REGISTRY),
        tonnageExported: SUMMED,
        // Turns on the registry's validFrom date, so a registry update alone
        // can flip it
        approved: excluded(ORS_REGISTRY)
      }
    ],
    unapprovedOverseasSites: [{ orsId: EXACT, tonnageExported: SUMMED }],
    totalTonnageExported: EXACT,
    tonnageRefusedAtDestination: EXACT,
    tonnageStoppedDuringExport: EXACT,
    totalTonnageRefusedOrStopped: EXACT,
    tonnageRepatriated: EXACT,
    tonnageReceivedNotExported: excluded(OPERATOR_ENTERED)
  },
  wasteSent: {
    tonnageSentToReprocessor: EXACT,
    tonnageSentToExporter: EXACT,
    tonnageSentToAnotherSite: EXACT,
    finalDestinations: [
      {
        recipientName: TEXT,
        // A validated dropdown the aggregation itself matches exactly
        facilityType: EXACT,
        address: TEXT,
        tonnageSentOn: SUMMED
      }
    ]
  },
  prn: excluded(
    'Not summary-log-derived: a summary-log upload, the only trigger of this comparison, cannot cause a PRN change'
  ),
  supportingInformation: excluded(OPERATOR_ENTERED)
}

/**
 * @param {FieldSpec} fieldSpec
 * @returns {fieldSpec is ExcludedField}
 */
const isExcluded = (fieldSpec) =>
  typeof fieldSpec === 'object' &&
  !Array.isArray(fieldSpec) &&
  'excluded' in fieldSpec

/**
 * Normalises an operator-typed value so a casing-, whitespace- or
 * blank-only edit does not read as a change: trims, collapses each run of
 * whitespace to a single space and lowercases, and treats a blank as absent. A
 * genuine edit (a different name or address) still differs.
 *
 * Each comma-separated part is tidied on its own and blank parts are dropped.
 * Addresses are stored as `formatAddress(address, postcode)` joined over the
 * raw cells, so stray whitespace in either cell lands next to the joining
 * comma, and a whitespace-only cell leaves an empty part behind.
 *
 * @param {*} value
 * @returns {ReportedDataValue}
 */
const normaliseText = (value) => {
  if (typeof value !== 'string') {
    return value
  }
  const normalised = value
    .split(',')
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => part !== '')
    .join(', ')
    .toLowerCase()
  return normalised === '' ? null : normalised
}

/**
 * Merges list items that are equal on every compared field except their
 * `summed` ones, adding those exactly (as decimals, so 0.1 + 0.2 is 0.3).
 * Every list item spec has one summed field, its tonnage.
 *
 * @param {{ [field: string]: FieldSpec }} itemSpec
 * @param {Array<{ [field: string]: ReportedDataValue }>} items - already picked
 * @returns {Array<{ [field: string]: ReportedDataValue }>}
 */
const mergeEqualItems = (itemSpec, items) => {
  const summedFields = Object.keys(itemSpec).filter(
    (field) => itemSpec[field] === SUMMED
  )
  const merged = new Map()
  for (const item of items) {
    const identity = canonicalise(
      Object.fromEntries(
        Object.entries(item).filter(([field]) => !summedFields.includes(field))
      )
    )
    const existing = merged.get(identity)
    if (existing) {
      for (const field of summedFields) {
        existing[field] = toNumber(
          add(
            /** @type {number} */ (existing[field]),
            /** @type {number} */ (item[field])
          )
        )
      }
    } else {
      merged.set(identity, { ...item })
    }
  }
  return [...merged.values()]
}

/**
 * Picks the compared fields of `value` as `fieldSpec` classifies them,
 * normalising free-text fields and merging equal list items. Absent values
 * extract as null.
 *
 * @param {FieldSpec} fieldSpec
 * @param {*} value
 * @returns {ReportedDataValue}
 */
const pickReportedData = (fieldSpec, value) => {
  if (value === undefined || value === null) {
    return null
  }
  if (fieldSpec === TEXT) {
    return normaliseText(value)
  }
  if (Array.isArray(fieldSpec)) {
    const itemSpec = /** @type {{ [field: string]: FieldSpec }} */ (
      fieldSpec[0]
    )
    return mergeEqualItems(
      itemSpec,
      value.map(
        (/** @type {*} */ item) =>
          /** @type {{ [field: string]: ReportedDataValue }} */ (
            pickReportedData(itemSpec, item)
          )
      )
    )
  }
  if (typeof fieldSpec === 'object') {
    return Object.fromEntries(
      Object.entries(fieldSpec)
        .filter(([, spec]) => !isExcluded(spec))
        .map(([field, spec]) => [field, pickReportedData(spec, value[field])])
    )
  }
  return value
}

/**
 * The compared subset of one report — the reported data it presents, per
 * `REPORTED_DATA_FIELDS`.
 *
 * @param {ReportedDataBearingReport} report
 * @returns {ReportedDataValue}
 */
const extractReportedData = (report) =>
  pickReportedData(REPORTED_DATA_FIELDS, report)

/** @param {string} a @param {string} b */
const byString = (a, b) => a.localeCompare(b)

/**
 * True for an object literal (or a prototype-less object): reported data holds
 * no class instances, so a Date, Map or similar would otherwise serialise as an
 * empty object and compare equal to any other.
 *
 * @param {object} value
 */
const isPlainObject = (value) => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Recursively serialises a value to a stable string with object keys sorted and
 * array elements ordered by their own serialisation, so the result is
 * insensitive to key order and row order. Strings are serialised verbatim:
 * normalising free text is a per-field decision made on extraction.
 *
 * Accepts only plain JSON: plain objects, arrays, strings, finite numbers,
 * booleans and null. Anything else (a Date, a class instance, NaN, undefined)
 * throws, because it would otherwise serialise ambiguously and could make two
 * different reports compare equal.
 *
 * @param {*} value
 * @returns {string}
 */
export const canonicalise = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).sort(byString).join(',')}]`
  }
  if (value !== null && typeof value === 'object' && isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort(byString)
      .map((key) => `${JSON.stringify(key)}:${canonicalise(value[key])}`)
    return `{${entries.join(',')}}`
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    Number.isFinite(value)
  ) {
    return JSON.stringify(value)
  }
  throw new TypeError(
    `Reported data must be plain JSON: cannot compare ${Object.prototype.toString.call(value)}`
  )
}

/** @param {string} path @param {string} field */
const joinPath = (path, field) => (path ? `${path}.${field}` : field)

/**
 * @param {FieldSpec} fieldSpec
 * @returns {fieldSpec is { [field: string]: FieldSpec }}
 */
const isBlockSpec = (fieldSpec) =>
  typeof fieldSpec === 'object' &&
  !Array.isArray(fieldSpec) &&
  !isExcluded(fieldSpec)

/**
 * @param {ReportedDataValue} value
 * @returns {value is { [field: string]: ReportedDataValue }}
 */
const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The paths of the compared fields that differ between two extracted values
 * `fieldSpec` classifies. Descends into a block present on both sides; reports
 * a leaf, a list, or a block present on only one side at its own path. List
 * items have no stable identity (they are compared as a set), so a changed list
 * is reported as a whole.
 *
 * @param {FieldSpec} fieldSpec
 * @param {ReportedDataValue} before
 * @param {ReportedDataValue} after
 * @param {string} path
 * @returns {string[]}
 */
const changedFieldPaths = (fieldSpec, before, after, path) => {
  if (canonicalise(before) === canonicalise(after)) {
    return []
  }
  if (isBlockSpec(fieldSpec) && isRecord(before) && isRecord(after)) {
    // Extraction emits every compared field of a present block, so each is set.
    return Object.entries(fieldSpec)
      .filter(([, spec]) => !isExcluded(spec))
      .flatMap(([field, spec]) =>
        changedFieldPaths(
          spec,
          /** @type {ReportedDataValue} */ (before[field]),
          /** @type {ReportedDataValue} */ (after[field]),
          joinPath(path, field)
        )
      )
  }
  return [path]
}

/**
 * The paths of the reported fields that differ between two reports, sorted
 * (e.g. `['wasteSent.finalDestinations']`). Empty when their reported data is
 * equivalent. Takes whole reports and extracts the compared subset itself, so
 * no caller can skip the exclusions, normalisation or merging. Paths only,
 * never values, so the result is safe to log.
 *
 * @param {ReportedDataBearingReport} previous
 * @param {ReportedDataBearingReport} current
 * @returns {string[]}
 */
export const diffReports = (previous, current) =>
  changedFieldPaths(
    REPORTED_DATA_FIELDS,
    extractReportedData(previous),
    extractReportedData(current),
    ''
  ).sort(byString)
