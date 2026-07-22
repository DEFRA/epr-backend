import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { REGISTERED_ONLY_PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { periodForDate } from '#reports/domain/period-for-date.js'
import { periodKey } from '#reports/domain/period-key.js'
import { formatPeriodLabel } from '#reports/domain/period-labels.js'
import { isResubmissionRequired } from '#reports/domain/resubmission.js'
import { auditMarkReportsRequiringResubmission } from '#reports/application/audit.js'

/**
 * @typedef {import('#reports/repository/port.js').PeriodicReport} PeriodicReport
 * @typedef {import('#reports/repository/port.js').ReportPerPeriod} ReportPerPeriod
 * @typedef {import('#reports/repository/port.js').ReportSummary} ReportSummary
 * @typedef {import('#reports/repository/port.js').ReportsRepository} ReportsRepository
 * @typedef {import('#reports/repository/port.js').MarkSubmittedReportRequiringResubmissionResult} MarkSubmittedReportRequiringResubmissionResult
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowState} SummaryLogRowState
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} SummaryLogRowStateRepository
 * @typedef {import('#waste-records/repository/port.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 * @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository
 * @typedef {{ reportingDateFields: string[] }} TableSchema
 */

/**
 * Startup diagnostic (PAE-1747) and backfill (PAE-1768): retrospectively finds
 * the reports a later summary-log upload restated in an already-closed period
 * -- the ones CPA (closed-period adjustments) would flag as needing
 * resubmission once enabled. `findPreCpaResubmissionReports` itself is
 * read-only; the backfill write path built on top of it lives in
 * `run-pre-cpa-resubmission-backfill.js`, gated by its own feature flag.
 *
 * A deliberately one-off diagnostic that REIMPLEMENTS the CPA rule rather than
 * calling the live path. Live CPA derives resubmission from waste-records; the
 * durable fix is to re-base that detection on the summary-log row-states
 * (ADR-0037) this diagnostic reads, but that rewrite is not yet scheduled and a
 * rough population size is needed sooner. So the rule is reconstructed here as a
 * faithful mirror of the live behaviour, accepting the residuals below, rather
 * than shared with it -- retire this once CPA detection itself moves onto
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
 * @property {string} restatingSummaryLogUploadedAt
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
 * The earliest submittedAt among submissions that carry one -- the time the
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
 * report (highest submissionNumber). A missing submittedAt is always
 * surfaced under `missing` for review, even when the report is also already
 * flagged, since it fails every gate comparison silently and is a
 * data-integrity anomaly independent of the resubmission-required state.
 * Otherwise, a report already requiring resubmission for any reason
 * (CPA-flagged or operator-requested) is not a fresh gap -- it is already
 * surfaced to operators -- so it is excluded entirely rather than
 * re-counted or re-flagged. Null when the period has no submitted
 * submission, is missing its submittedAt, or is already flagged.
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
  if (isResubmissionRequired(attributed.resubmissionRequired)) {
    return null
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
 * current accreditation is exposed, so earlier ids are not covered -- residual 1.
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
 * logs committed row states; failure-status logs are excluded. Row-state
 * membership is written against the uploaded file's id (`summaryLog.file.id`),
 * not the summary-log document's own `id`, so `fileId` is carried separately
 * for the row-state lookup while `id` (the document id, matching what live CPA
 * writes to `resubmissionRequired.closedPeriodRestated.summaryLogId`) is kept
 * for finding output.
 *
 * @param {SummaryLogsRepository} summaryLogsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<{ id: string, fileId: string, submittedAt: string }[]>}
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
      fileId: summaryLog.file.id,
      submittedAt: /** @type {string} */ (summaryLog.submittedAt)
    }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
}

/**
 * The cadence a row reports under, from its processing type: registered-only
 * template quarterly, any other monthly. The template proxies the accreditation
 * status CPA derives cadence from (a not-yet-approved registration uploads the
 * registered-only template and reports quarterly); it diverges only for an
 * accreditation cancelled while keeping its number -- see residual 2.
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
 * the ledgers read -- see residual 1).
 *
 * @param {SummaryLogRowStateRepository} summaryLogRowStateRepository
 * @param {WasteBalanceLedgerId[]} ledgers
 * @param {{ id: string, fileId: string, submittedAt: string }[]} logs
 * @returns {Promise<{ id: string, fileId: string, submittedAt: string, rows: SummaryLogRowState[] }[]>}
 */
const loadSnapshots = async (summaryLogRowStateRepository, ledgers, logs) => {
  const snapshots = []
  for (const log of logs) {
    const rows = []
    for (const ledger of ledgers) {
      rows.push(
        ...(await summaryLogRowStateRepository.findRowStatesForSummaryLog(
          ledger,
          log.fileId
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
 * Reporting-period refs one snapshot of a row's data falls in for a cadence --
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
 * -- the submittedAt values are ISO-8601 UTC strings, whose lexical order is
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
 * @param {{ id: string, submittedAt: string }} current
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
  restatingSummaryLogId: current.id,
  restatingSummaryLogUploadedAt: current.submittedAt
})

/**
 * Walks consecutive upload pairs and records a finding whenever a changed row
 * restates a period whose report was already submitted before the upload. The
 * row's cadence (and so which cadence's report it maps to) is taken per row from
 * its processing type. IGNORED (outside-accreditation) rows are routed to a
 * separate probe tally rather than counted or discarded -- see isIgnoredRow.
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
  `(${formatPeriodLabel(finding.cadence, finding.period, finding.year)}, ${finding.cadence}) -- ` +
  `closed period restated by summary log ${finding.restatingSummaryLogId} ` +
  `uploaded ${finding.restatingSummaryLogUploadedAt}, after the report was ` +
  `submitted ${finding.reportSubmittedAt}`

/**
 * Distinct organisations and registrations a set of findings touches -- the
 * scale figures the summary log line reports.
 *
 * @param {{ organisationId: string, registrationId: string }[]} findings
 * @returns {{ affectedOrganisations: number, affectedRegistrations: number }}
 */
export const summarisePreCpaResubmissionFindings = (findings) => ({
  affectedOrganisations: new Set(findings.map((f) => f.organisationId)).size,
  affectedRegistrations: new Set(findings.map((f) => f.registrationId)).size
})

/**
 * Groups findings by the exact key `markSubmittedReportsRequiringResubmission`
 * writes under -- one org/registration/summaryLogId batch shares a single
 * `uploadedAt` and periods list, mirroring how the live CPA event handler
 * calls the same repository method per upload.
 *
 * @param {PreCpaResubmissionFinding[]} findings
 * @returns {{
 *   organisationId: string,
 *   registrationId: string,
 *   summaryLogId: string,
 *   uploadedAt: string,
 *   periods: import('#reports/domain/period-key.js').PeriodRef[],
 *   expectedReportIds: Set<string>
 * }[]}
 */
const groupFindingsBySummaryLog = (findings) => {
  const groups = new Map()
  for (const finding of findings) {
    const key = `${finding.organisationId}::${finding.registrationId}::${finding.restatingSummaryLogId}`
    const group = groups.get(key) ?? {
      organisationId: finding.organisationId,
      registrationId: finding.registrationId,
      summaryLogId: finding.restatingSummaryLogId,
      uploadedAt: finding.restatingSummaryLogUploadedAt,
      periods: [],
      expectedReportIds: new Set()
    }
    group.periods.push({
      year: finding.year,
      cadence: finding.cadence,
      period: finding.period
    })
    group.expectedReportIds.add(finding.reportId)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/**
 * `markSubmittedReportsRequiringResubmission` re-derives "the latest
 * submitted report per period" itself at write time (mongodb-flagging.js),
 * independently of which report the scan attributed the finding to. If a
 * period was resubmitted in the window between the scan and this write, the
 * two can diverge -- the write would then flag a newer report than the one
 * the finding (and its log line) describe. `expectedReportIds` is the set
 * the scan attributed each period in this group to; any flagged id outside
 * it is surfaced here rather than silently trusted.
 *
 * @param {Set<string>} expectedReportIds
 * @param {MarkSubmittedReportRequiringResubmissionResult[]} flaggedReports
 * @returns {string[]}
 */
const unexpectedlyFlaggedReportIds = (expectedReportIds, flaggedReports) =>
  flaggedReports
    .map((report) => report.reportId)
    .filter((reportId) => !expectedReportIds.has(reportId))

/**
 * Backfill (PAE-1768): retrospectively sets `resubmissionRequired.closedPeriodRestated`
 * on every report `findPreCpaResubmissionReports` finds, using the same
 * idempotent, already-audited write path the live CPA event handler uses
 * (`markSubmittedReportsRequiringResubmission`) -- one call per
 * org/registration/summaryLogId group, each flagging that group's periods'
 * latest submitted reports as requiring resubmission at the upload that first
 * made them stale. Findings already exclude any report that requires
 * resubmission for any reason (see classifySlot), so this only ever adds
 * `closedPeriodRestated` to reports that had nothing set.
 *
 * Each group's write and audit are isolated in their own try/catch: one
 * group failing (a transient write error, say) is recorded in `failed`
 * rather than aborting every other group's already-in-flight or
 * not-yet-attempted work for this run.
 *
 * @param {{
 *   reportsRepository: ReportsRepository,
 *   summaryLogsRepository: SummaryLogsRepository,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   systemLogsRepository: SystemLogsRepository
 * }} deps
 * @returns {Promise<{
 *   findings: PreCpaResubmissionFinding[],
 *   ignoredInClosedPeriods: PreCpaResubmissionFinding[],
 *   reportsMissingSubmittedAt: ReportIdentity[],
 *   flagged: MarkSubmittedReportRequiringResubmissionResult[],
 *   unexpectedlyFlaggedReportIds: string[],
 *   failed: Array<{ organisationId: string, registrationId: string, summaryLogId: string, error: Error }>
 * }>}
 */
export const backfillPreCpaResubmissionReports = async ({
  reportsRepository,
  summaryLogsRepository,
  summaryLogRowStateRepository,
  organisationsRepository,
  systemLogsRepository
}) => {
  const { findings, ignoredInClosedPeriods, reportsMissingSubmittedAt } =
    await findPreCpaResubmissionReports({
      reportsRepository,
      summaryLogsRepository,
      summaryLogRowStateRepository,
      organisationsRepository
    })

  const flagged = []
  const unexpected = []
  const failed = []
  for (const { expectedReportIds, ...group } of groupFindingsBySummaryLog(
    findings
  )) {
    try {
      const reportsRequiringResubmission =
        await reportsRepository.markSubmittedReportsRequiringResubmission(group)

      if (reportsRequiringResubmission.length === 0) {
        continue
      }

      unexpected.push(
        ...unexpectedlyFlaggedReportIds(
          expectedReportIds,
          reportsRequiringResubmission
        )
      )

      flagged.push(...reportsRequiringResubmission)

      await auditMarkReportsRequiringResubmission({
        systemLogsRepository,
        organisationId: group.organisationId,
        registrationId: group.registrationId,
        reportsRequiringResubmission
      })
    } catch (error) {
      failed.push({
        organisationId: group.organisationId,
        registrationId: group.registrationId,
        summaryLogId: group.summaryLogId,
        error: /** @type {Error} */ (error)
      })
    }
  }

  return {
    findings,
    ignoredInClosedPeriods,
    reportsMissingSubmittedAt,
    flagged,
    unexpectedlyFlaggedReportIds: unexpected,
    failed
  }
}
