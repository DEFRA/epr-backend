import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { REGISTERED_ONLY_PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { periodForDate } from '#reports/domain/period-for-date.js'
import { periodKey } from '#reports/domain/period-key.js'
import { formatPeriodLabel } from '#reports/domain/period-labels.js'

/**
 * Startup diagnostic (PAE-1747): retrospectively sizes the pre-CPA population
 * of submitted reports that a later summary-log upload restated in an
 * already-closed period — the reports live CPA (closed-period adjustments)
 * would now surface as needing resubmission. Read-only: it writes nothing and
 * backfills no flags.
 *
 * It reconstructs the live rule from the `summary-log-row-states` collection
 * (ADR-0037): for each registration with submitted reports it snapshot-diffs
 * consecutive submitted uploads by state-doc `id` (an unchanged row keeps its
 * id; a changed or added row gets a new one — mirroring `determineRecordStatus`
 * ADDED/ADJUSTED, including oscillations a net-figure comparison would miss),
 * maps each changed row to the reporting periods it restates — the new row's
 * dates plus, for an adjustment, the previous row's dates so the period a load
 * moved OUT of is included, mirroring `closedPeriodRefsForRecord` — and records
 * a finding when a report for such a period had already been submitted before
 * the restating upload. Each row's cadence is taken from its processing type
 * (registered-only = quarterly, otherwise monthly) — the one cadence live CPA
 * applies per upload — so dates map to their own-cadence reports without
 * double-counting a month that a mid-quarter accreditation change left in both a
 * quarterly and a monthly report. Snapshots merge the rows committed under the
 * registered-only (null accreditationId) and current-accreditation ledgers,
 * approximating the registration-scoped committed state live CPA diffs against.
 *
 * KNOWN RESIDUALS (accepted for a flag-off sizing diagnostic; the figure sizes,
 * it is not authoritative). Both come from approximating a registration's
 * accreditation history from its current record:
 * 1. Only the null and current-accreditation ledgers are read. A registration
 *    re-accredited under a fresh id (or accredited then cancelled) has rows under
 *    a prior accreditation id that are not read, so an adjustment of such a row
 *    can look like an add and its moved-out closed period be missed — an
 *    under-count.
 * 2. Cadence is derived from the row's template, which is pinned to the presence
 *    of an accreditation number rather than to the accreditation status live CPA
 *    uses. They agree except for an accreditation that keeps its number after
 *    being cancelled: such uploads carry a monthly template but live CPA reports
 *    them quarterly, so those periods are mapped under the wrong cadence.
 *
 * @typedef {Object} PreCpaResubmissionFinding
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} reportId
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {string} reportSubmittedAt
 * @property {string} restatingSummaryLogId
 */

/**
 * @typedef {Object} SubmittedReport
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} reportId
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {string} reportSubmittedAt
 * @property {string} earliestSubmittedAt
 */

/**
 * Submitted submissions for a period in descending submissionNumber order —
 * `current` (the highest submissionNumber) first, then `previousSubmissions`.
 * `current` may itself be an unsubmitted resubmission-in-progress, so it is
 * dropped unless it reached 'submitted'; a period counts as closed whenever any
 * of its submissions did. `status` here is the report's currentStatus, so it is
 * filtered against REPORT_STATUS. A submitted report always carries a
 * submittedAt.
 *
 * @param {any} slot
 * @returns {any[]}
 */
const submittedSubmissions = (slot) =>
  [slot.current, ...slot.previousSubmissions].filter(
    (s) => s.status === REPORT_STATUS.SUBMITTED
  )

/**
 * Flattens periodic reports into one entry per submitted period, attributing to
 * the latest submitted report (the highest submissionNumber, first in
 * `submittedSubmissions`) and remembering when the period first closed. The
 * first close is the earliest submittedAt across the submitted submissions,
 * taken by timestamp rather than submissionNumber order: a resubmission's number
 * need not increase with its submission time, so the lowest-numbered submission
 * is not necessarily the earliest-submitted one.
 *
 * @param {any[]} periodicReports
 * @returns {SubmittedReport[]}
 */
const collectSubmittedReports = (periodicReports) => {
  const collected = []
  for (const pr of periodicReports) {
    for (const [cadence, byPeriod] of Object.entries(pr.reports)) {
      for (const [periodKey, slot] of Object.entries(byPeriod)) {
        const submitted = submittedSubmissions(slot)
        if (!submitted.length) {
          continue
        }
        const attributed = submitted[0]
        const earliestSubmittedAt = submitted.reduce(
          (earliest, s) =>
            s.submittedAt < earliest ? s.submittedAt : earliest,
          attributed.submittedAt
        )
        collected.push({
          organisationId: pr.organisationId,
          registrationId: pr.registrationId,
          reportId: attributed.id,
          year: pr.year,
          cadence,
          period: Number(periodKey),
          reportSubmittedAt: attributed.submittedAt,
          earliestSubmittedAt
        })
      }
    }
  }
  return collected
}

/**
 * @param {SubmittedReport[]} submittedReports
 * @returns {Map<string, { organisationId: string, registrationId: string, reports: SubmittedReport[] }>}
 */
const groupByRegistration = (submittedReports) => {
  const byRegistration = new Map()
  for (const report of submittedReports) {
    const key = `${report.organisationId}::${report.registrationId}`
    const group = byRegistration.get(key) ?? {
      organisationId: report.organisationId,
      registrationId: report.registrationId,
      reports: []
    }
    group.reports.push(report)
    byRegistration.set(key, group)
  }
  return byRegistration
}

/**
 * Row-state ledger identities a registration's uploads may sit under. The
 * registered-only phase commits rows under a null accreditationId and the
 * accredited phase under the accreditation id, so a registration that changed
 * state has snapshots under both — the diagnostic must read both to see the
 * registered-only-phase (quarterly) restatements. Registrations that can no
 * longer be looked up (deleted org/registration) are skipped, mirroring the
 * stale-issued-tonnage diagnostic.
 *
 * A registration that held several accreditation ids over its lifetime is only
 * partially covered — its current id plus null — since the registration record
 * exposes only the current accreditation.
 *
 * @param {any} organisationsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<{ organisationId: string, registrationId: string, accreditationId: string | null }[] | null>}
 */
const resolveLedgers = async (
  organisationsRepository,
  organisationId,
  registrationId
) => {
  let registration
  try {
    registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )
  } catch {
    return null
  }
  const accreditationIds = registration.accreditationId
    ? [null, registration.accreditationId]
    : [null]
  return accreditationIds.map((accreditationId) => ({
    organisationId,
    registrationId,
    accreditationId
  }))
}

/**
 * Submitted upload timeline for a registration, oldest-first. Only 'submitted'
 * logs committed row states; failure-status logs are excluded.
 *
 * @param {any} summaryLogsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<{ id: string, submittedAt: string }[]>}
 */
const loadSubmittedLogTimeline = async (
  summaryLogsRepository,
  organisationId,
  registrationId
) => {
  const logs = await summaryLogsRepository.findAllByOrgReg(
    organisationId,
    registrationId
  )
  return logs
    .filter(
      ({ summaryLog }) =>
        summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED &&
        summaryLog.submittedAt
    )
    .map(({ id, summaryLog }) => ({ id, submittedAt: summaryLog.submittedAt }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
}

/**
 * The cadence a row reports under, taken from its processing type — the
 * registered-only template maps to quarterly, any other template to monthly.
 * The template is pinned to the presence of an accreditation number, a close
 * proxy for the accreditation status live CPA derives cadence from: a
 * not-yet-approved registration (no number) uploads the registered-only template
 * and maps to quarterly, matching its reports. The proxy diverges only for an
 * accreditation cancelled while keeping its number — see the module residuals.
 *
 * @param {any} row
 * @returns {string}
 */
const cadenceForRow = (row) =>
  REGISTERED_ONLY_PROCESSING_TYPES.has(row.processingType)
    ? CADENCE.quarterly
    : CADENCE.monthly

/**
 * Each submitted log's full committed row-state snapshot, oldest-first. A row
 * commits under one ledger (the accreditation state at that upload), so reading
 * each candidate ledger and concatenating yields that log's snapshot with no
 * duplication. The merged snapshot approximates the registration-scoped
 * committed state live CPA diffs against (its existingRecordsMap is
 * registration-scoped, not ledger-scoped), so a load adjusted across the
 * registered-only/accredited transition is still paired with its predecessor —
 * within the ledgers read (see the module residuals for prior-accreditation ids).
 *
 * @param {any} summaryLogRowStateRepository
 * @param {{ organisationId: string, registrationId: string, accreditationId: string | null }[]} ledgers
 * @param {{ id: string, submittedAt: string }[]} logs
 * @returns {Promise<{ id: string, submittedAt: string, rows: any[] }[]>}
 */
const loadSnapshots = async (summaryLogRowStateRepository, ledgers, logs) => {
  const snapshots = []
  for (const log of logs) {
    const rows = []
    for (const ledger of ledgers) {
      rows.push(
        ...(await summaryLogRowStateRepository.findRowStatesForSummaryLog(
          ledger,
          log.id
        ))
      )
    }
    snapshots.push({ ...log, rows })
  }
  return snapshots
}

/**
 * Stable identity of a row's load across uploads: an adjustment keeps the same
 * wasteRecordType and rowId while committing a new state-doc id. Mirrors the
 * `${type}:${rowId}` key live CPA uses to pair a new row with its predecessor.
 *
 * @param {any} row
 * @returns {string}
 */
const rowIdentityKey = (row) => `${row.wasteRecordType}:${row.rowId}`

/**
 * Reporting-period refs one snapshot of a row's data falls in for a cadence —
 * one per reporting date field that carries a value (a row can span two periods
 * for exporter tables).
 *
 * @param {Record<string, any>} data
 * @param {any} schema
 * @param {string} cadence
 * @returns {import('#reports/domain/period-key.js').PeriodRef[]}
 */
const periodsForData = (data, schema, cadence) => {
  const refs = []
  for (const field of schema.reportingDateFields) {
    const dateValue = data[field]
    if (dateValue) {
      const { year, period } = periodForDate(dateValue, cadence)
      refs.push({ year, cadence, period })
    }
  }
  return refs
}

/**
 * The distinct reporting periods a changed row restates. For an adjustment this
 * is the union of the new row's periods AND the previous row's periods, so the
 * period a load moved OUT of is included — mirroring live CPA's
 * closedPeriodRefsForRecord, which classifies both the new and the existing
 * record's data under the NEW row's schema (and skips a row with no schema).
 * Deduped by period identity so a same-period edit is counted once.
 *
 * @param {any} row - the changed (later-snapshot) row
 * @param {Map<string, any>} previousByRow - previous snapshot rows by identity
 * @returns {import('#reports/domain/period-key.js').PeriodRef[]}
 */
const restatedPeriods = (row, previousByRow) => {
  const schema = findSchemaForProcessingType(
    row.processingType,
    row.wasteRecordType
  )
  if (!schema) {
    return []
  }
  const cadence = cadenceForRow(row)
  const prior = previousByRow.get(rowIdentityKey(row))
  const refs = [
    ...periodsForData(row.data, schema, cadence),
    ...(prior ? periodsForData(prior.data, schema, cadence) : [])
  ]
  return [...new Map(refs.map((ref) => [periodKey(ref), ref])).values()]
}

/**
 * Walks consecutive upload pairs and records a finding whenever a changed row
 * restates a period whose report was already submitted before the upload. The
 * row's cadence (and so which cadence's report it maps to) is taken per row from
 * its processing type. IGNORED (outside-accreditation) rows are split off into a
 * separate probe tally rather than counted or discarded — see the loop comment.
 *
 * @param {{
 *   snapshots: { id: string, submittedAt: string, rows: any[] }[],
 *   reportByPeriodKey: Map<string, SubmittedReport>,
 *   organisationId: string,
 *   registrationId: string
 * }} params
 * @returns {{ findings: PreCpaResubmissionFinding[], ignored: PreCpaResubmissionFinding[] }}
 */
const diffFindings = ({
  snapshots,
  reportByPeriodKey,
  organisationId,
  registrationId
}) => {
  const findings = []
  const ignored = []
  for (let i = 1; i < snapshots.length; i++) {
    const previous = snapshots[i - 1]
    const current = snapshots[i]
    const previousIds = new Set(previous.rows.map((row) => row.id))
    const previousByRow = new Map(
      previous.rows.map((row) => [rowIdentityKey(row), row])
    )
    for (const row of current.rows) {
      if (previousIds.has(row.id)) {
        continue
      }
      // Live CPA (classifyByPeriodStatus) skips IGNORED (outside-accreditation)
      // rows, so they never become findings. A report period should never
      // overlap unaccredited time, so an IGNORED row folding into a reported
      // closed period should be impossible — tally any as an invariant probe
      // (expected empty) rather than silently discarding them.
      const isIgnored =
        row.classification?.outcome === WASTE_BALANCE_OUTCOME.IGNORED
      for (const ref of restatedPeriods(row, previousByRow)) {
        const report = reportByPeriodKey.get(periodKey(ref))
        if (report && report.earliestSubmittedAt < current.submittedAt) {
          ;(isIgnored ? ignored : findings).push({
            organisationId,
            registrationId,
            reportId: report.reportId,
            year: report.year,
            cadence: report.cadence,
            period: report.period,
            reportSubmittedAt: report.reportSubmittedAt,
            restatingSummaryLogId: current.id
          })
        }
      }
    }
  }
  return { findings, ignored }
}

/**
 * @param {{
 *   organisationId: string,
 *   registrationId: string,
 *   reports: SubmittedReport[],
 *   summaryLogsRepository: any,
 *   summaryLogRowStateRepository: any,
 *   organisationsRepository: any
 * }} params
 * @returns {Promise<{ findings: PreCpaResubmissionFinding[], ignored: PreCpaResubmissionFinding[] }>}
 */
const findForRegistration = async ({
  organisationId,
  registrationId,
  reports,
  summaryLogsRepository,
  summaryLogRowStateRepository,
  organisationsRepository
}) => {
  const ledgers = await resolveLedgers(
    organisationsRepository,
    organisationId,
    registrationId
  )
  if (!ledgers) {
    return { findings: [], ignored: [] }
  }
  const logs = await loadSubmittedLogTimeline(
    summaryLogsRepository,
    organisationId,
    registrationId
  )
  if (logs.length < 2) {
    return { findings: [], ignored: [] }
  }
  const snapshots = await loadSnapshots(
    summaryLogRowStateRepository,
    ledgers,
    logs
  )
  const reportByPeriodKey = new Map(
    reports.map((report) => [
      periodKey({
        year: report.year,
        cadence: report.cadence,
        period: report.period
      }),
      report
    ])
  )
  return diffFindings({
    snapshots,
    reportByPeriodKey,
    organisationId,
    registrationId
  })
}

/**
 * @param {PreCpaResubmissionFinding[]} findings
 * @returns {PreCpaResubmissionFinding[]}
 */
const dedupeByReportId = (findings) => {
  const byReportId = new Map()
  for (const finding of findings) {
    if (!byReportId.has(finding.reportId)) {
      byReportId.set(finding.reportId, finding)
    }
  }
  return [...byReportId.values()]
}

/**
 * `ignoredInClosedPeriods` is an invariant probe: reports an IGNORED
 * (outside-accreditation) restatement folded into. It is expected to be empty,
 * because report periods never overlap unaccredited time; a non-empty result
 * flags a period that did, or a genuine CPA blind spot, and warrants review.
 *
 * @param {{
 *   reportsRepository: any,
 *   summaryLogsRepository: any,
 *   summaryLogRowStateRepository: any,
 *   organisationsRepository: any
 * }} deps
 * @returns {Promise<{ scanned: number, findings: PreCpaResubmissionFinding[], ignoredInClosedPeriods: PreCpaResubmissionFinding[] }>}
 */
export const findPreCpaResubmissionReports = async ({
  reportsRepository,
  summaryLogsRepository,
  summaryLogRowStateRepository,
  organisationsRepository
}) => {
  const periodicReports = await reportsRepository.findAllPeriodicReports()
  const submittedReports = collectSubmittedReports(periodicReports)
  const findings = []
  const ignored = []
  for (const { organisationId, registrationId, reports } of groupByRegistration(
    submittedReports
  ).values()) {
    const result = await findForRegistration({
      organisationId,
      registrationId,
      reports,
      summaryLogsRepository,
      summaryLogRowStateRepository,
      organisationsRepository
    })
    findings.push(...result.findings)
    ignored.push(...result.ignored)
  }
  return {
    scanned: submittedReports.length,
    findings: dedupeByReportId(findings),
    ignoredInClosedPeriods: dedupeByReportId(ignored)
  }
}

/**
 * Renders a finding as a single reviewable log line. The wording is
 * deliberately retrospective — it sizes accumulated divergence that live CPA
 * would now surface, it is not a prediction of what the next upload will flag.
 *
 * @param {PreCpaResubmissionFinding} finding
 * @returns {string}
 */
export const formatPreCpaResubmissionFinding = (finding) =>
  `Pre-CPA resubmission (retrospective): org ${finding.organisationId} / ` +
  `registration ${finding.registrationId}, report ${finding.reportId} ` +
  `(${formatPeriodLabel(finding.cadence, finding.period, finding.year)}, ${finding.cadence}) — ` +
  `closed period restated by summary log ${finding.restatingSummaryLogId} ` +
  `uploaded after the report was submitted ${finding.reportSubmittedAt}`

/**
 * Distinct organisations and registrations a set of findings touches — the
 * scale figures the summary log line reports.
 *
 * @param {{ organisationId: string, registrationId: string }[]} findings
 * @returns {{ affectedOrganisations: number, affectedRegistrations: number }}
 */
export const summarisePreCpaResubmissionFindings = (findings) => ({
  affectedOrganisations: new Set(findings.map((f) => f.organisationId)).size,
  affectedRegistrations: new Set(findings.map((f) => f.registrationId)).size
})
