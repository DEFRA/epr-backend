import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { EXPORTER_POLICY } from './policy/exporter.js'
import { EXPORTER_REGISTERED_ONLY_POLICY } from './policy/exporter-registered-only.js'
import { REPROCESSOR_INPUT_POLICY } from './policy/reprocessor-input.js'
import { REPROCESSOR_OUTPUT_POLICY } from './policy/reprocessor-output.js'
import { REPROCESSOR_REGISTERED_ONLY_POLICY } from './policy/reprocessor-registered-only.js'

/**
 * @import { RequiredByCode } from './reason-codes.js'
 * @import { RuleTrigger } from './triggers.js'
 */

/**
 * A single conditional-required rule. When `trigger` holds for a row, every
 * field in `requiredFields` must be filled for the report to be created. The
 * rule applies to a row anywhere in the summary log, not just the rows the
 * report being created aggregates.
 *
 * `requiredFields` is deliberately distinct from a table's
 * `WASTE_BALANCE_CONTENT_FIELDS` (the set `checkRequiredFields` uses to decide
 * whether a row contributes to the waste balance). The two answer different
 * questions (can this report be created vs does this tonnage count) and their
 * field sets and consequences diverge, so they are kept as separate concepts
 * rather than unified. See the classify helpers under `#domain/summary-logs`.
 *
 * @typedef {object} ReportMandatoryRule
 * @property {RequiredByCode} requiredBy - Why the fields are required (for the FE payload).
 * @property {RuleTrigger} trigger
 * @property {string[]} requiredFields
 */

/**
 * A template's rules grouped by the waste-record type (table) they apply to.
 * The engine looks up a row's rules by its `wasteRecordType`.
 *
 * @typedef {Record<string, ReportMandatoryRule[]>} ReportMandatoryPolicy
 */

/**
 * Report-mandatory policy per processing type. All five summary-log templates
 * are populated: the two exporter templates (PAE-1420) and the three reprocessor
 * templates (PAE-1280).
 *
 * The three reprocessor policies are kept as separate modules even though their
 * rule bodies currently coincide: each sources its fields from its own template
 * schema and the templates may diverge (a mandatory field added or dropped for
 * one variant). The policy test guards that their field names stay real, so a
 * drift in one module fails in isolation rather than silently.
 *
 * @type {Partial<Record<string, ReportMandatoryPolicy>>}
 */
const POLICY_BY_PROCESSING_TYPE = Object.freeze({
  [PROCESSING_TYPES.EXPORTER]: EXPORTER_POLICY,
  [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY]: EXPORTER_REGISTERED_ONLY_POLICY,
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: REPROCESSOR_INPUT_POLICY,
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: REPROCESSOR_OUTPUT_POLICY,
  [PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY]:
    REPROCESSOR_REGISTERED_ONLY_POLICY
})

/**
 * Resolves the report-mandatory policy for a processing type, or null when the
 * template has no report-creation completeness rules yet.
 *
 * @param {string} processingType
 * @returns {ReportMandatoryPolicy | null}
 */
export const reportMandatoryPolicyFor = (processingType) =>
  POLICY_BY_PROCESSING_TYPE[processingType] ?? null
