import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  buildSummaryLogSubmitters,
  buildSystemLogSubmitters,
  resolveSummaryLogSubmitters
} from '#waste-balances/application/summary-log-submitters.js'

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
 * @typedef {Object} AccreditationSourceDeps
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @property {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @property {import('#repositories/waste-records/port.js').WasteRecordsRepository} wasteRecordsRepository
 * @property {import('#overseas-sites/repository/port.js').OverseasSitesRepository} overseasSitesRepository
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepository} summaryLogsRepository
 * @property {import('#repositories/system-logs/port.js').SystemLogsRepository} systemLogsRepository
 */

/**
 * @typedef {{ systemLog: number, transaction: number, backfill: number }} SubmitterProvenance
 */

/**
 * Load the organisation, registration, and accreditation for a balance row,
 * then fetch all authoritative sources needed to rebuild the event stream
 * or recompute totals. Each historical summary log's real submitting actor is
 * recovered from the dedicated submit system-log audit, falling back to the
 * embedded waste-balance transaction actor and then the backfill actor, so the
 * rebuilt stream attributes submissions to the person who made them. The source
 * that supplied each submitter is counted (`submitterProvenance`) and the two
 * recoverable sources are cross-checked where they overlap
 * (`submitterAgreement`) so coverage and source agreement are measurable before
 * cutover.
 *
 * @param {{ accreditationId: string, organisationId: string, transactions?: Array<import('#waste-balances/domain/model.js').WasteBalanceTransaction> }} row
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
  const submitActors = await systemLogsRepository.findSummaryLogSubmitActors(
    row.organisationId
  )

  const { submitters, agreement } = resolveSummaryLogSubmitters({
    systemLogSubmitters: buildSystemLogSubmitters({
      submitActors,
      summaryLogDocs
    }),
    transactionSubmitters: buildSummaryLogSubmitters({
      transactions: row.transactions,
      wasteRecords
    })
  })

  /** @type {SubmitterProvenance} */
  const submitterProvenance = { systemLog: 0, transaction: 0, backfill: 0 }
  const summaryLogs = summaryLogDocs
    .filter(
      ({ summaryLog }) => summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED
    )
    .map(toStreamSummaryLog)
    .map((summaryLog) => {
      const resolved = submitters.get(summaryLog.id)
      if (!resolved) {
        submitterProvenance.backfill += 1
        return summaryLog
      }
      submitterProvenance[resolved.source] += 1
      return { ...summaryLog, submittedBy: resolved.submitter }
    })

  return {
    accreditation,
    registration,
    wasteRecords,
    prns,
    overseasSites,
    summaryLogs,
    submitterProvenance,
    submitterAgreement: agreement
  }
}
