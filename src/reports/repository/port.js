/**
 * @typedef {import('#reports/domain/report-status.js').ReportStatus} ReportStatus
 */

/**
 * @typedef {Object} UserSummary
 * @property {string} id
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} position
 */

/**
 * @typedef {{ at: string, by: UserSummary }} ReportOperation
 */

/**
 * @typedef {{ status: ReportStatus, at: string, by: UserSummary }} ReportStatusHistoryItem
 */

/**
 * @typedef {ReportOperation & { declaredBy?: string }} ReportSubmittedSlot
 */

/**
 * @typedef {Object} ReportStatusObject
 * @property {ReportStatus} currentStatus
 * @property {string} currentStatusAt - ISO timestamp
 * @property {ReportOperation} created
 * @property {ReportOperation} [ready]
 * @property {ReportSubmittedSlot} [submitted]
 * @property {ReportOperation} [unsubmitted]
 * @property {ReportStatusHistoryItem[]} history
 */

/**
 * @typedef {Object} Supplier
 * @property {string} supplierName
 * @property {string} facilityType
 * @property {string} supplierAddress
 * @property {string} supplierPhone
 * @property {string} supplierEmail
 * @property {number} tonnageReceived
 */

/**
 * @typedef {Object} FinalDestination
 * @property {string} recipientName
 * @property {string} facilityType
 * @property {string} address
 * @property {number} tonnageSentOn
 */

/**
 * @typedef {Object} RecyclingActivity
 * @property {Supplier[]} suppliers
 * @property {number} totalTonnageReceived
 * @property {number | null} tonnageRecycled
 * @property {number | null} tonnageNotRecycled
 */

/**
 * @typedef {Object} ExportActivity
 * @property {Array<{orsId: string, siteName: string, country: string|null, tonnageExported?: number}>} overseasSites
 * @property {Array<{orsId: string, tonnageExported: number}>} unapprovedOverseasSites
 * @property {number} totalTonnageExported
 * @property {number} tonnageReceivedNotExported
 * @property {number|null} tonnageRefusedAtDestination
 * @property {number|null} tonnageStoppedDuringExport
 * @property {number|null} tonnageRepatriated
 */

/**
 * @typedef {Object} WasteSent
 * @property {number} tonnageSentToReprocessor
 * @property {number} tonnageSentToExporter
 * @property {number} tonnageSentToAnotherSite
 * @property {FinalDestination[]} finalDestinations
 */

/**
 * @typedef {Object} PrnData
 * @property {number} issuedTonnage
 * @property {number | null} [totalRevenue]
 * @property {number | null} [averagePricePerTonne]
 * @property {number | null} freeTonnage
 */

/**
 * @typedef {Object} SourceData
 * @property {string[]} summaryLogIds
 */

/**
 * Provenance of a report: the summary log it was last (re)built from.
 * @typedef {{ summaryLogId: string, lastUploadedAt: string | null }} ReportSource
 */

/**
 * @typedef {{ uploadedAt: string, summaryLogId: string }} StaleSummaryLogChanged
 */

/**
 * @typedef {{ occurredAt: string, prnId: string }} StalePrnCancelled
 */

/**
 * A report can be stale for either or both independent reasons at once, each
 * carrying its own provenance. Presence of a named field is the reason code
 * — see {@link staleReasons} in `#reports/domain/stale.js`.
 * @typedef {{
 *   summaryLogChanged?: StaleSummaryLogChanged,
 *   prnCancelled?: StalePrnCancelled
 * }} ReportStale
 */

/**
 * @typedef {{ uploadedAt: string, reason: ResubmissionReason, summaryLogId: string }} ReportResubmissionRequired
 */

/**
 * Per-report result returned by {@link ReportsRepository.markActiveReportsStaleForSummaryLog}.
 * Contains the fields needed to audit the stale transition.
 *
 * @typedef {Object} MarkReportStaleResult
 * @property {string} reportId
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {number} submissionNumber
 * @property {ReportStale} stale
 */

/**
 * Parameters for {@link ReportsRepository.markActiveReportsStaleForPrnCancellation}.
 * @typedef {Object} MarkActiveReportsStaleForPrnCancellationParams
 * @property {string} organisationId - MongoDB ObjectId hex string
 * @property {string} registrationId - MongoDB ObjectId hex string
 * @property {number} year
 * @property {string} cadence - 'monthly' or 'quarterly'
 * @property {number} period
 * @property {string} prnId
 * @property {string} occurredAt
 */

/**
 * Parameters for {@link ReportsRepository.markSubmittedReportsRequiringResubmission}.
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   summaryLogId: string,
 *   uploadedAt: string,
 *   periods: PeriodRef[]
 * }} MarkSubmittedReportsRequiringResubmissionParams
 */

/**
 * Per-report result returned by
 * {@link ReportsRepository.markSubmittedReportsRequiringResubmission}.
 * Contains the fields needed to audit the resubmission-required transition.
 * @typedef {{
 *   reportId: string,
 *   year: number,
 *   cadence: string,
 *   period: number,
 *   submissionNumber: number,
 *   resubmissionRequired: ReportResubmissionRequired
 * }} MarkSubmittedReportRequiringResubmissionResult
 */

/**
 * @typedef {Object} Report
 * @property {string} id
 * @property {number} version
 * @property {number} schemaVersion
 * @property {number} submissionNumber
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {string} startDate - Bare calendar date (YYYY-MM-DD)
 * @property {string} endDate - Bare calendar date (YYYY-MM-DD)
 * @property {string} dueDate - Bare calendar date (YYYY-MM-DD)
 * @property {ReportStatusObject} status
 * @property {string} [material]
 * @property {string} [wasteProcessingType]
 * @property {string} [siteAddress]
 * @property {RecyclingActivity} [recyclingActivity]
 * @property {ExportActivity} [exportActivity]
 * @property {WasteSent} [wasteSent]
 * @property {PrnData} [prn]
 * @property {string} [supportingInformation]
 * @property {SourceData} [sourceData]
 * @property {ReportSource} [source]
 * @property {ReportStale} [stale]
 * @property {ReportResubmissionRequired} [resubmissionRequired]
 */

/**
 * @typedef {Object} ReportSummary
 * @property {string} id
 * @property {ReportStatus} status
 * @property {number} submissionNumber
 * @property {string|null} submittedAt - ISO timestamp of submission, or null if not submitted
 * @property {UserSummary|null} submittedBy - User who submitted, or null if not submitted
 * @property {ReportResubmissionRequired|null} resubmissionRequired - set when a later summary log restated this submitted period
 * @property {RecyclingActivity} [recyclingActivity]
 * @property {ExportActivity} [exportActivity]
 * @property {WasteSent} [wasteSent]
 * @property {PrnData} [prn]
 * @property {string} [supportingInformation]
 */

/**
 * Curated subset of ReportSummary used for list-style responses
 * (e.g. the reports calendar). Excludes heavy activity payloads.
 * @typedef {Pick<ReportSummary, 'id' | 'status' | 'submissionNumber' | 'submittedAt' | 'submittedBy'>} ReportListItem
 */

/**
 * @typedef {Object} ReportPerPeriod
 * @property {string} startDate - Bare calendar date (YYYY-MM-DD), no timezone. Use
 *   startOfDay()/endOfDay() from #common/helpers/date-formatter.js to derive
 *   a concrete instant.
 * @property {string} endDate - Bare calendar date (YYYY-MM-DD), no timezone.
 * @property {string} dueDate - Bare calendar date (YYYY-MM-DD), no timezone.
 * @property {ReportSummary|null} current
 * @property {ReportSummary[]} previousSubmissions
 */

/**
 * @typedef {Object} ReportPerPeriodKey
 * @property {string} organisationId - MongoDB ObjectId hex string
 * @property {string} registrationId - MongoDB ObjectId hex string
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 */

/**
 * @typedef {Object.<string, ReportPerPeriod>} PeriodicReportSlots
 */

/**
 * @typedef {Object} PeriodicReport
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {number} year
 * @property {{ monthly?: PeriodicReportSlots, quarterly?: PeriodicReportSlots }} reports
 */

/**
 * @typedef {Object} CreateReportParams
 * @property {string} organisationId - MongoDB ObjectId hex string
 * @property {string} registrationId - MongoDB ObjectId hex string
 * @property {number} year
 * @property {string} cadence - 'monthly' or 'quarterly'
 * @property {number} period
 * @property {string} startDate - Bare calendar date (YYYY-MM-DD), no timezone. Use
 *   startOfDay()/endOfDay() from #common/helpers/date-formatter.js to derive
 *   a concrete instant.
 * @property {string} endDate - Bare calendar date (YYYY-MM-DD), no timezone.
 * @property {string} dueDate - Bare calendar date (YYYY-MM-DD), no timezone.
 * @property {UserSummary} changedBy
 * @property {number} submissionNumber
 * @property {string} [material]
 * @property {string} [wasteProcessingType]
 * @property {string} [siteAddress]
 * @property {RecyclingActivity} [recyclingActivity]
 * @property {ExportActivity} [exportActivity]
 * @property {WasteSent} [wasteSent]
 * @property {PrnData | null} [prn]
 * @property {string} [supportingInformation]
 * @property {ReportSource} source
 */

/**
 * @typedef {Object} UpdateReportParams
 * @property {string} reportId
 * @property {number} version - current version for optimistic locking
 * @property {{ status?: ReportStatus, supportingInformation?: string, prn?: Partial<PrnData>, recyclingActivity?: Partial<RecyclingActivity>, exportActivity?: Partial<ExportActivity> }} fields
 * @property {UserSummary} [changedBy]
 */

/**
 * @typedef {Object} UpdateReportStatusParams
 * @property {string} reportId
 * @property {number} version - current version for optimistic locking
 * @property {ReportStatus} status
 * @property {string} slot - the status object key to record this transition (e.g. 'ready', 'submitted', 'unsubmitted')
 * @property {UserSummary} [changedBy]
 * @property {string} [submissionDeclaredBy] - full name typed by the user on the declaration form; stored in status.submitted.declaredBy
 */

/**
 * @typedef {Object} DeleteReportParams
 * @property {string} organisationId - MongoDB ObjectId hex string
 * @property {string} registrationId - MongoDB ObjectId hex string
 * @property {number} year
 * @property {string} cadence - 'monthly' or 'quarterly'
 * @property {number} period
 * @property {number} [submissionNumber]
 * @property {UserSummary} changedBy
 */

/**
 * @typedef {Object} FindPeriodicReportsParams
 * @property {string} organisationId - MongoDB ObjectId hex string
 * @property {string} registrationId - MongoDB ObjectId hex string
 */

/**
 * @typedef {Object} ReportsRepository
 * @property {(params: CreateReportParams) => Promise<Report>} createReport
 * @property {(params: UpdateReportParams) => Promise<Report>} updateReport
 * @property {(params: UpdateReportStatusParams) => Promise<Report>} updateReportStatus
 * @property {(params: DeleteReportParams) => Promise<void>} deleteReport
 * @property {(params: FindPeriodicReportsParams) => Promise<PeriodicReport[]>} findPeriodicReports
 * @property {() => Promise<PeriodicReport[]>} findAllPeriodicReports
 * @property {(reportId: string) => Promise<Report>} findReportById
 * @property {(organisationId: string, registrationId: string, summaryLogId: string, uploadedAt: string) => Promise<MarkReportStaleResult[]>} markActiveReportsStaleForSummaryLog
 *   Marks all active (in_progress / ready_to_submit) reports as stale for the given org/reg,
 *   skipping any report already built from `summaryLogId` or already stale from it.
 *   Sets `stale.summaryLogChanged`, leaving `stale.prnCancelled` untouched if present.
 *   Returns the per-report stale details for auditing.
 * @property {(params: MarkActiveReportsStaleForPrnCancellationParams) => Promise<MarkReportStaleResult[]>} markActiveReportsStaleForPrnCancellation
 *   Marks the active (in_progress / ready_to_submit) report for the given org/reg/period
 *   as stale for a PRN cancellation, skipping it if already flagged for this `prnId`.
 *   Sets `stale.prnCancelled`, leaving `stale.summaryLogChanged` untouched if present.
 *   Returns the per-report stale details for auditing (empty array if no active report
 *   exists for the period).
 * @property {(params: MarkSubmittedReportsRequiringResubmissionParams) => Promise<MarkSubmittedReportRequiringResubmissionResult[]>} markSubmittedReportsRequiringResubmission
 *   For each given period, flags the latest submitted report as requiring resubmission,
 *   skipping any report already flagged from `summaryLogId` or built from it.
 *   Returns the per-report details for auditing.
 * @property {(organisationId: string, registrationId: string, since: string) => Promise<boolean>} hasReportSubmittedSince
 *   Returns true when any report for the org/reg was submitted strictly after
 *   `since` (a canonical ISO timestamp, as produced by toISOString throughout),
 *   read from the denormalised `status.submitted` slot. Used to detect a period
 *   closing during the summary log validate-to-submit window.
 */

/**
 * @typedef {() => ReportsRepository} ReportsRepositoryFactory
 */

/**
 * @import { ResubmissionReason } from '#reports/domain/resubmission.js'
 * @import { PeriodRef } from '#reports/domain/period-key.js'
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
