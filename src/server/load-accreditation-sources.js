import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { isRegisteredOnlyAccreditation } from '#domain/organisations/accreditation.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  addAttribution,
  buildSystemLogSubmitters
} from '#waste-balances/application/summary-log-submitters.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'

/** @type {Set<import('#domain/organisations/registration.js').Registration['status']>} */
const ACTIVE_REGISTRATION_STATUSES = new Set([
  REG_ACC_STATUS.APPROVED,
  REG_ACC_STATUS.CANCELLED,
  REG_ACC_STATUS.SUSPENDED
])

/**
 * Map a summary log document from findAllByOrgReg into the shape that
 * computeRebuiltStream expects. Uses summaryLog.file.id (the file
 * identifier stored on waste record versions) rather than the document
 * _id, which is a different namespace.
 *
 * @param {{ summaryLog: { file: { id: string }, status: string, submittedAt?: string } }} doc
 */
export const toStreamSummaryLog = ({ summaryLog }) => ({
  id: summaryLog.file.id,
  status: summaryLog.status,
  submittedAt: summaryLog.submittedAt
})

/**
 * @typedef {{ skipped: 'registered-only', accreditation: import('#domain/organisations/accreditation.js').Accreditation }} RegisteredOnlySkip
 */

/**
 * @typedef {Object} AccreditationSourceDeps
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @property {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @property {import('#repositories/waste-records/port.js').WasteRecordsRepository} wasteRecordsRepository
 * @property {import('#overseas-sites/repository/port.js').OverseasSitesRepository} overseasSitesRepository
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepository} summaryLogsRepository
 * @property {import('#repositories/system-logs/port.js').SystemLogsRepository} systemLogsRepository
 */

/**
 * Map each summary-log document id to the audit actor that attributes its
 * submission. Callers supply `submitActors` newest-first, so the first audit row
 * seen for a document wins, matching how the submitter map resolves a
 * resubmitted document.
 *
 * @param {Array<{ summaryLogId: string, createdBy?: import('#waste-balances/application/summary-log-submitters.js').SubmitAuditActor }>} submitActors
 * @returns {Map<string, import('#waste-balances/application/summary-log-submitters.js').SubmitAuditActor | undefined>}
 */
const auditActorByDocId = (submitActors) => {
  const byDocId = new Map()
  for (const { summaryLogId, createdBy } of submitActors) {
    if (!byDocId.has(summaryLogId)) {
      byDocId.set(summaryLogId, createdBy)
    }
  }
  return byDocId
}

/**
 * Recover each submitted summary log's real submitter from the submit system-log
 * audit, falling back to the backfill actor only when no actor is attributable.
 * Alongside, build the SUMMARY_LOG_SUBMITTED row of the per-event-kind
 * attribution matrix: each submitted log is classified by the labels its audit
 * actor carries (name, email, id-only, or no actor at all), with scope presence
 * tallied too, so attribution quality is visible per kind before cutover.
 *
 * @param {Object} params
 * @param {Array<{ summaryLogId: string, createdBy?: import('#waste-balances/application/summary-log-submitters.js').SubmitAuditActor }>} params.submitActors
 * @param {Array<{ id: string, summaryLog: { file: { id: string }, status: string, submittedAt?: string } }>} params.summaryLogDocs
 */
const recoverSubmitters = ({ submitActors, summaryLogDocs }) => {
  const submitters = buildSystemLogSubmitters({ submitActors, summaryLogDocs })

  const submittedDocs = summaryLogDocs.filter(
    ({ summaryLog }) => summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED
  )

  const auditActors = auditActorByDocId(submitActors)

  /** @type {import('#waste-balances/application/summary-log-submitters.js').AttributionMatrix} */
  const attributionMatrix = {}
  for (const doc of submittedDocs) {
    addAttribution(
      attributionMatrix,
      STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      auditActors.get(doc.id)
    )
  }

  const summaryLogs = submittedDocs
    .map(toStreamSummaryLog)
    .map((summaryLog) => {
      const submitter = submitters.get(summaryLog.id)
      return submitter ? { ...summaryLog, submittedBy: submitter } : summaryLog
    })

  return {
    summaryLogs,
    attributionMatrix
  }
}

/**
 * Load the organisation, registration, and accreditation for a balance row,
 * then fetch all authoritative sources needed to rebuild the event stream
 * or recompute totals. Each historical summary log's real submitting actor is
 * recovered from the dedicated submit system-log audit, falling back to the
 * backfill actor only when no actor is attributable, so the rebuilt stream
 * attributes submissions to the person who made them. The SUMMARY_LOG_SUBMITTED
 * row of the per-event-kind attribution matrix (`attributionMatrix`) records the
 * label quality of each submission's actor — name, email, id-only, or no actor
 * at all, plus scope presence — so coverage is measurable per kind before
 * cutover.
 *
 * A registered-only accreditation (status 'created' or 'rejected') holds no
 * waste balance and has no authoritative history to rebuild, so it returns the
 * `{ skipped: 'registered-only' }` discriminant before the active-registration
 * lookup. Callers count it as skipped rather than treating the absent active
 * registration as a rebuild failure.
 *
 * @param {{ accreditationId: string, organisationId: string }} row
 * @param {AccreditationSourceDeps} deps
 */
export const loadAccreditationSources = async (row, deps) => {
  const {
    organisationsRepository,
    prnRepository,
    wasteRecordsRepository,
    overseasSitesRepository,
    summaryLogsRepository,
    systemLogsRepository
  } = deps

  const organisation = await organisationsRepository.findById(
    row.organisationId
  )
  const accreditation = organisation.accreditations.find(
    (a) => a.id === row.accreditationId
  )
  if (!accreditation) {
    throw new Error(
      `Accreditation ${row.accreditationId} not found on organisation ${row.organisationId}`
    )
  }
  if (isRegisteredOnlyAccreditation(accreditation)) {
    return /** @type {RegisteredOnlySkip} */ ({
      skipped: 'registered-only',
      accreditation
    })
  }
  const registration = organisation.registrations.find(
    (r) =>
      r.accreditationId === row.accreditationId &&
      ACTIVE_REGISTRATION_STATUSES.has(r.status)
  )
  if (!registration) {
    throw new Error(
      `No registration links to accreditation ${row.accreditationId} on organisation ${row.organisationId}`
    )
  }

  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    row.organisationId,
    registration.id
  )
  const prns = await prnRepository.findByAccreditation(row.accreditationId)
  const overseasSites = await resolveOverseasSites(
    organisationsRepository,
    overseasSitesRepository,
    row.organisationId,
    registration.id
  )
  const summaryLogDocs = await summaryLogsRepository.findAllByOrgReg(
    row.organisationId,
    registration.id
  )
  const summaryLogDocIds = summaryLogDocs.map((doc) => String(doc.id))
  const submitActors =
    await systemLogsRepository.findSummaryLogSubmitActors(summaryLogDocIds)

  const { summaryLogs, attributionMatrix } = recoverSubmitters({
    submitActors,
    summaryLogDocs
  })

  return {
    accreditation,
    registration,
    wasteRecords,
    prns,
    overseasSites,
    summaryLogs,
    attributionMatrix
  }
}
