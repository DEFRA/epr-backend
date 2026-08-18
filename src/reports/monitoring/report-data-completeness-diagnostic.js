import { findIssues } from '#reports/application/report-mandatory/assert-report-data-complete.js'
import { reportMandatoryPolicyFor } from '#reports/domain/report-mandatory/index.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { MATERIAL } from '#domain/organisations/model.js'

/**
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 * @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 */

/**
 * A summary log that would be blocked by the report-completeness gate, with the
 * detail the diagnostic reports on: where it sits (org/registration/accreditation),
 * how it was uploaded (template, material) and how much fails (violating rows).
 *
 * @typedef {object} CompletenessFinding
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string | null} accreditationId
 * @property {string} summaryLogId
 * @property {string} processingType - The SL's template (uniform across its rows).
 * @property {string} material
 * @property {number} violatingRows - Distinct rows with at least one missing field.
 */

/**
 * A violating summary log whose registration could not be resolved (deleted or
 * re-versioned away), so its material is unknown. Reported separately so a single
 * missing registration degrades one line rather than aborting the whole scan.
 *
 * @typedef {object} UnresolvedRegistration
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} summaryLogId
 */

/**
 * Material reported for a violating summary log whose registration could not be
 * resolved. A real value would be one of the `MATERIAL` enum; this stands in so
 * the finding still counts toward the estate totals and the per-material rollup.
 */
export const UNKNOWN_MATERIAL = 'unknown'

/**
 * The templates the completeness gate can evaluate today, derived from the
 * policy registry rather than hard-coded. When the reprocessor templates plug in
 * (PAE-1280) they join automatically, so the diagnostic needs no change to work
 * on the larger data set.
 *
 * @returns {string[]}
 */
export const evaluatedTemplates = () =>
  Object.values(PROCESSING_TYPES).filter(
    (processingType) => reportMandatoryPolicyFor(processingType) !== null
  )

/**
 * Scans every live summary log across the estate and returns the ones that would
 * fail the report-completeness rules. Reuses the gate's own `findIssues` so the
 * diagnostic and the gate can never drift. Rows whose template has no policy
 * produce no issues and are counted in `scanned` but never flagged. Read-only.
 *
 * @param {object} deps
 * @param {WasteBalanceLedgerRepository} deps.ledgerRepository
 * @param {SummaryLogRowStatesRepository} deps.summaryLogRowStatesRepository
 * @param {OrganisationsRepository} deps.organisationsRepository
 * @returns {Promise<{ scanned: number, findings: CompletenessFinding[], unresolved: UnresolvedRegistration[] }>}
 */
export const findReportDataCompletenessFindings = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationsRepository
}) => {
  const ledgers =
    await ledgerRepository.findLatestSubmittedSummaryLogPerLedger()

  /** @type {CompletenessFinding[]} */
  const findings = []
  /** @type {UnresolvedRegistration[]} */
  const unresolved = []
  for (const { ledgerId, summaryLogId } of ledgers) {
    const rows = await summaryLogRowStatesRepository.findRowStatesForSummaryLog(
      ledgerId,
      summaryLogId
    )
    const issues = findIssues(rows)
    if (issues.length === 0) {
      continue
    }
    // A deleted or re-versioned registration must not abort the estate scan:
    // record it, report the material as unknown, and keep the finding so the
    // blast-radius count stays truthful.
    let material = UNKNOWN_MATERIAL
    try {
      const registration = await organisationsRepository.findRegistrationById(
        ledgerId.organisationId,
        ledgerId.registrationId
      )
      material = registration.material
    } catch {
      unresolved.push({
        organisationId: ledgerId.organisationId,
        registrationId: ledgerId.registrationId,
        summaryLogId
      })
    }
    findings.push({
      organisationId: ledgerId.organisationId,
      registrationId: ledgerId.registrationId,
      accreditationId: ledgerId.accreditationId,
      summaryLogId,
      processingType: rows[0].processingType,
      material,
      violatingRows: new Set(issues.map((issue) => issue.rowId)).size
    })
  }
  return { scanned: ledgers.length, findings, unresolved }
}

/**
 * @param {CompletenessFinding} finding
 * @returns {string}
 */
export const formatFinding = (finding) => {
  const accreditation = finding.accreditationId ?? 'registered-only'
  return (
    `Report-data diagnostic: summary log ${finding.summaryLogId} ` +
    `(template ${finding.processingType}, material ${finding.material}) -- ` +
    `org ${finding.organisationId} / registration ${finding.registrationId} / ` +
    `accreditation ${accreditation} -- ${finding.violatingRows} incomplete row(s)`
  )
}

/**
 * Counts the violating summary logs per evaluated template (including templates
 * with none, so absence of signal is explicit).
 *
 * @param {CompletenessFinding[]} findings
 * @returns {{ processingType: string, count: number }[]}
 */
export const summariseByTemplate = (findings) =>
  evaluatedTemplates().map((processingType) => ({
    processingType,
    count: findings.filter((f) => f.processingType === processingType).length
  }))

/**
 * @param {{ processingType: string, count: number }} summary
 * @returns {string}
 */
export const formatTemplateSummary = ({ processingType, count }) =>
  `Report-data diagnostic by template: ${processingType} -- ${count} summary log(s) with incomplete data`

/**
 * Counts the violating summary logs per material, across every known material
 * plus any material actually seen that is not in the enum (legacy or drifted
 * values, and the unknown-registration placeholder). Emitting the seen-but-
 * unmodelled materials keeps this rollup reconcilable with the estate totals.
 *
 * @param {CompletenessFinding[]} findings
 * @returns {{ material: string, count: number }[]}
 */
export const summariseByMaterial = (findings) => {
  const materials = [
    ...new Set([...Object.values(MATERIAL), ...findings.map((f) => f.material)])
  ]
  return materials.map((material) => ({
    material,
    count: findings.filter((f) => f.material === material).length
  }))
}

/**
 * @param {{ material: string, count: number }} summary
 * @returns {string}
 */
export const formatMaterialSummary = ({ material, count }) =>
  `Report-data diagnostic by material: ${material} -- ${count} summary log(s) with incomplete data`

/**
 * @param {UnresolvedRegistration} unresolved
 * @returns {string}
 */
export const formatUnresolved = ({
  organisationId,
  registrationId,
  summaryLogId
}) =>
  `Report-data diagnostic: could not resolve registration ${registrationId} ` +
  `(org ${organisationId}) for summary log ${summaryLogId}; material reported as ${UNKNOWN_MATERIAL}`

/**
 * @param {{ scanned: number, findings: CompletenessFinding[] }} result
 * @returns {string}
 */
export const formatTotals = ({ scanned, findings }) => {
  const distinct = (values) => new Set(values).size
  const organisations = distinct(findings.map((f) => f.organisationId))
  const registrations = distinct(findings.map((f) => f.registrationId))
  const accreditations = distinct(
    findings.map((f) => f.accreditationId).filter((id) => id !== null)
  )
  return (
    `Report-data diagnostic summary: scanned ${scanned} summary log(s), ` +
    `${findings.length} with incomplete data across ${organisations} organisation(s) / ` +
    `${registrations} registration(s) / ${accreditations} accreditation(s). ` +
    `Evaluated templates: ${evaluatedTemplates().join(', ')} ` +
    `(other templates have no completeness rules yet).`
  )
}
