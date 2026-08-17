import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { EXPORTER_POLICY } from './policy/exporter.js'
import { EXPORTER_REGISTERED_ONLY_POLICY } from './policy/exporter-registered-only.js'

/**
 * @import { RequiredByCode } from './reason-codes.js'
 * @import { RuleTrigger } from './triggers.js'
 */

/**
 * A single conditional-required rule. When `trigger` holds for a row whose
 * `dateField` value falls in the report period, every field in `requiredFields`
 * must be filled for the report to be created.
 *
 * @typedef {object} ReportMandatoryRule
 * @property {RequiredByCode} requiredBy - Why the fields are required (for the FE payload).
 * @property {string} dateField - Section date field that scopes the rule to the report period.
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
 * Report-mandatory policy per processing type. Only the two exporter templates
 * are populated: the three reprocessor templates plug in under PAE-1280.
 *
 * @type {Partial<Record<string, ReportMandatoryPolicy>>}
 */
const POLICY_BY_PROCESSING_TYPE = Object.freeze({
  [PROCESSING_TYPES.EXPORTER]: EXPORTER_POLICY,
  [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY]: EXPORTER_REGISTERED_ONLY_POLICY
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
