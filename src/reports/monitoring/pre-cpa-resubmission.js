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
 * @typedef {import('#reports/repository/port.js').PeriodicReport} PeriodicReport
 * @typedef {import('#reports/repository/port.js').ReportPerPeriod} ReportPerPeriod
 * @typedef {import('#reports/repository/port.js').ReportSummary} ReportSummary
 * @typedef {import('#reports/repository/port.js').ReportsRepository} ReportsRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowState} SummaryLogRowState
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} SummaryLogRowStateRepository
 * @typedef {import('#waste-records/repository/port.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 * @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {{ reportingDateFields: string[] }} TableSchema
 */

/**
 * Startup diagnostic (PAE-1747): retrospectively sizes the reports a later
 * summary-log upload restated in an already-closed period — the ones CPA
 * (closed-period adjustments) would flag as needing resubmission once enabled.
 * Read-only: writes nothing, backfills no flags.
 *
 * A deliberately one-off diagnostic that REIMPLEMENTS the CPA rule rather than
 * calling the live path. Live CPA derives resubmission from waste-records; the
 * durable fix is to re-base that detection on the summary-log row-states
 * (ADR-0037) this diagnostic reads, but that rewrite is not yet scheduled and a
 * rough population size is needed sooner. So the rule is reconstructed here as a
 * faithful mirror of the live behaviour, accepting the residuals below, rather
 * than shared with it — retire this once CPA detection itself moves onto
 * row-states.
 *
 * It reads the `summary-log-row-states` collection (ADR-0037) and, per
 * registration, snapshot-diffs consecutive submitted uploads
 * by state-doc `id` (a changed or added row gets a new id, mirroring
 * `determineRecordStatus`, so oscillations a net-figure diff would miss still
 * count), maps each changed row to the periods it restates (the new row's dates
 * plus, for an adjustment, the previous row's, so a moved-out period is counted,
 * per `closedPeriodRefsForRecord`), and records a finding when that period's
 * report was submitted before the upload. Cadence comes from the row's
 * processing type (registered-only quarterly, else monthly); snapshots merge the
 * null- and current-accreditation ledgers to approximate the registration-scoped
 * state CPA diffs against.
 *
 * Known residuals (accepted for a flag-off sizing figure; both from reading only
 * a registration's current accreditation):
 * 1. Prior accreditation ids are not read, so an adjustment of a row under one
 *    can look like an add and its moved-out period be missed (under-count).
 * 2. Cadence keys off the template's accreditation-number presence, not the
 *    status CPA uses; they differ only for an accreditation cancelled while
 *    keeping its number, whose periods then map under the wrong cadence.
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
 * @typedef {Object} ReportIdentity
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} reportId
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 */

/**
 * @typedef {ReportIdentity & {
 *   reportSubmittedAt: string,
 *   earliestSubmittedAt: string
 * }} SubmittedReport
 */

/**
 * A period's submitted submissions (`current` then `previousSubmissions`, so
 * descending submissionNumber). `current` may be an unsubmitted resubmission in
 * progress, so it is kept only if it reached 'submitted'; a period counts as
 * closed if any submission did. `status` is the report's currentStatus, hence
 * REPORT_STATUS not the summary-log enum.
 *
 * @param {ReportPerPeriod} slot
 * @returns {ReportSummary[]}
 */
const submittedSubmissions = (slot) =>
  [
    /** @type {ReportSummary} */ (slot.current),
    ...slot.previousSubmissions
  ].filter((s) => s.status === REPORT_STATUS.SUBMITTED)

/**
 * Flattens the nested { cadence: { period: slot } } report structure into a flat
 * list of period slots, so each slot is classified in one shallow loop.
 *
 * @param {PeriodicReport[]} periodicReports
 * @returns {{ pr: PeriodicReport, cadence: string, period: number, slot: ReportPerPeriod }[]}
 */
const periodSlots = (periodicReports) =>
  periodicReports.flatMap((pr) =>
    Object.entries(pr.reports).flatMap(([cadence, byPeriod]) =>
      Object.entries(
        /** @type {Record<string, ReportPerPeriod>} */ (byPeriod)
      ).map(([period, slot]) => ({
        pr,
        cadence,
        period: Number(period),
        slot
      }))
    )
  )

/**
 * The earliest submittedAt among submissions that carry one — the time the
 * period first closed. Taken by timestamp, not submissionNumber order: a
 * resubmission's number need not increase with its submission time, so the
 * lowest-numbered submission is not necessarily the earliest-submitted one.
 *
 * @param {ReportSummary[]} submissions
 * @returns {string}
 */
const earliestSubmittedAtOf = (submissions) => {
  const times = /** @type {string[]} */ (
    submissions.map((s) => s.submittedAt).filter(Boolean)
  )
  return times.toSorted((a, b) => a.localeCompare(b))[0]
}

/**
 * Classifies one submitted period slot, attributing to its latest submitted
 * report (highest submissionNumber). Returns that report when it carries a
 * submittedAt; a missing one cannot be placed in the timeline (it fails every
 * gate comparison silently), so it is surfaced under `missing` for review. Null
 * when the period has no submitted submission.
 *
 * @param {{ pr: PeriodicReport, cadence: string, period: number, slot: ReportPerPeriod }} entry
 * @returns {{ report?: SubmittedReport, missing?: ReportIdentity } | null}
 */
const classifySlot = ({ pr, cadence, period, slot }) => {
  const submitted = submittedSubmissions(slot)
  if (!submitted.length) {
    return null
  }
  const attributed = submitted[0]
  const identity = {
    organisationId: pr.organisationId,
    registrationId: pr.registrationId,
    reportId: attributed.id,
    year: pr.year,
    cadence,
    period
  }
  if (!attributed.submittedAt) {
    return { missing: identity }
  }
  return {
    report: {
      ...identity,
      reportSubmittedAt: attributed.submittedAt,
      earliestSubmittedAt: earliestSubmittedAtOf(submitted)
    }
  }
}

/**
 * Splits every submitted period into evaluable `reports` and the data-integrity
 * `missingSubmittedAt` list.
 *
 * @param {PeriodicReport[]} periodicReports
 * @returns {{ reports: SubmittedReport[], missingSubmittedAt: ReportIdentity[] }}
 */
const collectSubmittedReports = (periodicReports) => {
  const reports = []
  const missingSubmittedAt = []
  for (const entry of periodSlots(periodicReports)) {
    const classified = classifySlot(entry)
    if (classified?.missing) {
      missingSubmittedAt.push(classified.missing)
    }
    if (classified?.report) {
      reports.push(classified.report)
    }
  }
  return { reports, missingSubmittedAt }
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
 * The ledgers a registration's uploads may sit under: null (registered-only
 * phase) and the current accreditation id (accredited phase), so a registration
 * that changed state is read under both. Returns null for a registration that
 * can no longer be looked up (deleted org/registration), skipping it. Only the
 * current accreditation is exposed, so earlier ids are not covered — residual 1.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<WasteBalanceLedgerId[] | null>}
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
 * @param {SummaryLogsRepository} summaryLogsRepository
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
    .map(({ id, summaryLog }) => ({
      id,
      submittedAt: /** @type {string} */ (summaryLog.submittedAt)
    }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
}

/**
 * The cadence a row reports under, from its processing type: registered-only
 * template quarterly, any other monthly. The template proxies the accreditation
 * status CPA derives cadence from (a not-yet-approved registration uploads the
 * registered-only template and reports quarterly); it diverges only for an
 * accreditation cancelled while keeping its number — see residual 2.
 *
 * @param {SummaryLogRowState} row
 * @returns {string}
 */
const cadenceForRow = (row) =>
  /** @type {ReadonlySet<string>} */ (REGISTERED_ONLY_PROCESSING_TYPES).has(
    row.processingType
  )
    ? CADENCE.quarterly
    : CADENCE.monthly

/**
 * Each submitted log's full committed row-state snapshot, oldest-first. A row
 * commits under one ledger, so concatenating the candidate ledgers yields the
 * log's snapshot without duplication. Merging the ledgers approximates the
 * registration-scoped state CPA diffs against, so a load adjusted across the
 * registered-only/accredited transition still pairs with its predecessor (within
 * the ledgers read — see residual 1).
 *
 * @param {SummaryLogRowStateRepository} summaryLogRowStateRepository
 * @param {WasteBalanceLedgerId[]} ledgers
 * @param {{ id: string, submittedAt: string }[]} logs
 * @returns {Promise<{ id: string, submittedAt: string, rows: SummaryLogRowState[] }[]>}
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
 * @param {SummaryLogRowState} row
 * @returns {string}
 */
const rowIdentityKey = (row) => `${row.wasteRecordType}:${row.rowId}`

/**
 * Reporting-period refs one snapshot of a row's data falls in for a cadence —
 * one per reporting date field that carries a value (a row can span two periods
 * for exporter tables).
 *
 * @param {Record<string, any>} data
 * @param {TableSchema} schema
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
 * The distinct periods a changed row restates: for an adjustment, the union of
 * the new and previous rows' periods, so a moved-out period is included. Mirrors
 * closedPeriodRefsForRecord (both classified under the new row's schema; a row
 * with no schema is skipped). Deduped so a same-period edit counts once.
 *
 * @param {SummaryLogRowState} row - the changed (later-snapshot) row
 * @param {Map<string, SummaryLogRowState>} previousByRow - previous snapshot rows by identity
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
 * Whether the report's period had already closed when this upload landed (its
 * earliest submission predates it). localeCompare keeps the `<` operands numeric
 * — the submittedAt values are ISO-8601 UTC strings, whose lexical order is
 * chronological.
 *
 * @param {SubmittedReport} report
 * @param {{ submittedAt: string }} upload
 * @returns {boolean}
 */
const closedBeforeUpload = (report, upload) =>
  report.earliestSubmittedAt.localeCompare(upload.submittedAt) < 0

/**
 * Rows present in `current` but not the previous snapshot. A changed or added
 * row commits a new state-doc id, so a row whose id is absent from the previous
 * snapshot is a restatement (mirrors determineRecordStatus ADDED/ADJUSTED).
 *
 * @param {{ rows: SummaryLogRowState[] }} current
 * @param {Set<string>} previousIds
 * @returns {SummaryLogRowState[]}
 */
const changedRows = (current, previousIds) =>
  current.rows.filter((row) => !previousIds.has(row.id))

/**
 * CPA (classifyByPeriodStatus) skips IGNORED (outside-accreditation) rows, so
 * they never become findings. Since a report period never overlaps unaccredited
 * time, an IGNORED row in a reported closed period should be impossible; such
 * rows go to an invariant probe (expected empty) rather than being discarded.
 *
 * @param {SummaryLogRowState} row
 * @returns {boolean}
 */
const isIgnoredRow = (row) =>
  row.classification?.outcome === WASTE_BALANCE_OUTCOME.IGNORED

/**
 * The already-closed reports a changed row restates: each period the row folds
 * into whose report was submitted before this upload landed.
 *
 * @param {SummaryLogRowState} row
 * @param {Map<string, SummaryLogRowState>} previousByRow
 * @param {Map<string, SubmittedReport>} reportByPeriodKey
 * @param {{ submittedAt: string }} current
 * @returns {SubmittedReport[]}
 */
const closedRestatements = (row, previousByRow, reportByPeriodKey, current) => {
  const reports = []
  for (const ref of restatedPeriods(row, previousByRow)) {
    const report = reportByPeriodKey.get(periodKey(ref))
    if (report && closedBeforeUpload(report, current)) {
      reports.push(report)
    }
  }
  return reports
}

/**
 * @param {SubmittedReport} report
 * @param {{ id: string }} current
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {PreCpaResubmissionFinding}
 */
const buildFinding = (report, current, organisationId, registrationId) => ({
  organisationId,
  registrationId,
  reportId: report.reportId,
  year: report.year,
  cadence: report.cadence,
  period: report.period,
  reportSubmittedAt: report.reportSubmittedAt,
  restatingSummaryLogId: current.id
})

/**
 * Walks consecutive upload pairs and records a finding whenever a changed row
 * restates a period whose report was already submitted before the upload. The
 * row's cadence (and so which cadence's report it maps to) is taken per row from
 * its processing type. IGNORED (outside-accreditation) rows are routed to a
 * separate probe tally rather than counted or discarded — see isIgnoredRow.
 *
 * @param {{
 *   snapshots: { id: string, submittedAt: string, rows: SummaryLogRowState[] }[],
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
    for (const row of changedRows(current, previousIds)) {
      const bucket = isIgnoredRow(row) ? ignored : findings
      for (const report of closedRestatements(
        row,
        previousByRow,
        reportByPeriodKey,
        current
      )) {
        bucket.push(
          buildFinding(report, current, organisationId, registrationId)
        )
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
 *   summaryLogsRepository: SummaryLogsRepository,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository,
 *   organisationsRepository: OrganisationsRepository
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
  // A restatement can only happen with two or more summary logs: a lone upload
  // must be the only one the reports are based on, so it falls outside CPA scope.
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
 * `ignoredInClosedPeriods` is an invariant probe (expected empty): reports an
 * IGNORED (outside-accreditation) restatement folded into, which should not
 * happen since report periods never overlap unaccredited time.
 * `reportsMissingSubmittedAt` lists submitted reports with no submittedAt,
 * excluded from `scanned` and surfaced rather than silently dropped.
 *
 * @param {{
 *   reportsRepository: ReportsRepository,
 *   summaryLogsRepository: SummaryLogsRepository,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository,
 *   organisationsRepository: OrganisationsRepository
 * }} deps
 * @returns {Promise<{ scanned: number, findings: PreCpaResubmissionFinding[], ignoredInClosedPeriods: PreCpaResubmissionFinding[], reportsMissingSubmittedAt: ReportIdentity[] }>}
 */
export const findPreCpaResubmissionReports = async ({
  reportsRepository,
  summaryLogsRepository,
  summaryLogRowStateRepository,
  organisationsRepository
}) => {
  const periodicReports = await reportsRepository.findAllPeriodicReports()
  const { reports: submittedReports, missingSubmittedAt } =
    collectSubmittedReports(periodicReports)
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
    ignoredInClosedPeriods: dedupeByReportId(ignored),
    reportsMissingSubmittedAt: missingSubmittedAt
  }
}

/**
 * Renders a finding as one reviewable log line. Wording is deliberately
 * retrospective: it sizes accumulated divergence, not a prediction of what the
 * next upload will flag.
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
