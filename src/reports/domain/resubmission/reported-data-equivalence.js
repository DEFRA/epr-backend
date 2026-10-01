/**
 * What counts as a change to a report's reported data, intended for the
 * planned resubmission gate. The tests are the specification.
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
 * Every field in `reportDataFieldsSchema`, classified.
 *
 * @type {{ [field: string]: FieldSpec }}
 */
export const REPORTED_DATA_FIELDS = {
  source: excluded('Provenance: changes on every upload'),
  recyclingActivity: {
    suppliers: [
      {
        supplierName: TEXT,
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
 * Normalises operator-typed text so a casing-, whitespace- or blank-only edit
 * does not read as a change. Works per comma-separated part, because addresses
 * are joined from untrimmed cells by `formatAddress`.
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
 * Merges list items equal on every field but their `summed` ones, adding those
 * as decimals. The aggregation groups rows on raw values, including ones the
 * comparison ignores, so one entry can arrive split in two.
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
 * Picks the compared fields of `value` as `fieldSpec` classifies them.
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
 * The compared subset of one report, per `REPORTED_DATA_FIELDS`.
 *
 * @param {ReportedDataBearingReport} report
 * @returns {ReportedDataValue}
 */
const extractReportedData = (report) =>
  pickReportedData(REPORTED_DATA_FIELDS, report)

/** @param {string} a @param {string} b */
const byString = (a, b) => a.localeCompare(b)

/**
 * True for an object literal or a prototype-less object.
 *
 * @param {object} value
 */
const isPlainObject = (value) => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Serialises plain JSON to a string insensitive to key order and row order.
 * Throws on anything else, which would otherwise serialise ambiguously.
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
 * The paths of the compared fields that differ between two extracted values.
 * List items have no stable identity, so a changed list is reported whole.
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
 * The sorted paths of the reported fields that differ between two reports
 * (e.g. `['wasteSent.finalDestinations']`), empty when equivalent. Paths only,
 * never values, so the result is safe to log. Extracts internally so no caller
 * can skip the exclusions, normalisation or merging.
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
