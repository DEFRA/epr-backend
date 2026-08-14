import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { SENT_ON_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/shared/fields.js'
import {
  DROPDOWN_PLACEHOLDER,
  isYes
} from '#domain/summary-logs/table-schemas/shared/index.js'
import { isExporterCategory } from '#reports/domain/operator-category.js'

/**
 * @import { OperatorCategory } from '#reports/domain/operator-category.js'
 */

/**
 * A report-mandatory rule: a row-local, template-agnostic conditional-required
 * check. When `trigger` matches the row's data, every field in `requiredFields`
 * must be filled for the report to be created.
 *
 * @typedef {object} ReportMandatoryRule
 * @property {string} id - Acceptance-criterion label (for diagnostics only).
 * @property {(data: Record<string, any>) => boolean} trigger
 * @property {string[]} requiredFields
 */

/**
 * A resolved rule set plus the per-field values that count as "unfilled"
 * (dropdown placeholders). Shared by all templates within an operator category.
 *
 * @typedef {object} ReportMandatorySpec
 * @property {readonly ReportMandatoryRule[]} rules
 * @property {Record<string, readonly string[]>} unfilledValues
 */

const tonnageOverZero = (field) => (data) => Number(data[field]) > 0
const answeredYes = (field) => (data) => isYes(data[field])

/**
 * Exporter report-mandatory rules (PAE-1420 AC1–AC5).
 *
 * Keyed by trigger field, applied to every row regardless of template or
 * wasteRecordType: the field names are canonical across accredited and
 * registered-only exporter templates, and each trigger is co-located with its
 * mandatory fields on a single row state. Registered-only templates carry no
 * interim-site columns, so the AC5 rule simply never fires there.
 *
 * This is the gate's own source of truth for the mandatory set, mirroring
 * notes/plans/PAE-1420/mandatory-fields-reconciliation.md — it deliberately
 * does not reuse the schemas' waste-balance field sets (see validation-design.md).
 *
 * @type {readonly ReportMandatoryRule[]}
 */
export const EXPORTER_REPORT_MANDATORY_RULES = Object.freeze([
  {
    id: 'AC1',
    trigger: tonnageOverZero(RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_EXPORT),
    requiredFields: [
      RECEIVED_LOADS_FIELDS.SUPPLIER_NAME,
      RECEIVED_LOADS_FIELDS.SUPPLIER_ADDRESS,
      RECEIVED_LOADS_FIELDS.SUPPLIER_POSTCODE,
      RECEIVED_LOADS_FIELDS.SUPPLIER_EMAIL,
      RECEIVED_LOADS_FIELDS.SUPPLIER_PHONE_NUMBER,
      RECEIVED_LOADS_FIELDS.ACTIVITIES_CARRIED_OUT_BY_SUPPLIER
    ]
  },
  {
    id: 'AC2_AC4',
    trigger: tonnageOverZero(
      RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED
    ),
    requiredFields: [
      RECEIVED_LOADS_FIELDS.OSR_ID,
      RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT
    ]
  },
  {
    id: 'AC5',
    trigger: answeredYes(
      RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
    ),
    requiredFields: [RECEIVED_LOADS_FIELDS.INTERIM_SITE_ID]
  },
  {
    id: 'AC3',
    trigger: tonnageOverZero(
      SENT_ON_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
    ),
    requiredFields: [
      SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_NAME,
      SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_FACILITY_TYPE,
      SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_ADDRESS,
      SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_POSTCODE
    ]
  }
])

/**
 * Per-field unfilled-value definitions for the exporter mandatory fields. Only
 * dropdown fields need an entry: a cell left on the placeholder must count as
 * unfilled rather than as a valid value.
 *
 * @type {Record<string, readonly string[]>}
 */
export const EXPORTER_REPORT_MANDATORY_UNFILLED_VALUES = Object.freeze({
  [SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_FACILITY_TYPE]: DROPDOWN_PLACEHOLDER
})

const EXPORTER_SPEC = Object.freeze({
  rules: EXPORTER_REPORT_MANDATORY_RULES,
  unfilledValues: EXPORTER_REPORT_MANDATORY_UNFILLED_VALUES
})

/**
 * Resolves the report-mandatory spec for an operator category, or null when the
 * category has no report-creation completeness rules. The reprocessor twin
 * (PAE-1280) plugs its spec in here.
 *
 * @param {OperatorCategory} operatorCategory
 * @returns {ReportMandatorySpec | null}
 */
export const reportMandatorySpecFor = (operatorCategory) =>
  isExporterCategory(operatorCategory) ? EXPORTER_SPEC : null
