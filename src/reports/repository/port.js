/**
 * @typedef {import('#reports/domain/report-status.js').ReportStatus} ReportStatus
 */

/**
 * @typedef {Object} UserSummary
 * @property {string} id
 * @property {string} name
 * @property {string} position
 */

/**
 * @typedef {Object} StatusHistoryEntry
 * @property {ReportStatus} status
 * @property {UserSummary} changedBy
 * @property {string} changedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} Supplier
 * @property {string} supplierName
 * @property {string} facilityType
 * @property {string} address
 * @property {string} phone
 * @property {string} email
 * @property {number} tonnageReceived
 */

/**
 * @typedef {Object} FinalDestination
 * @property {string} recipientName
 * @property {string} facilityType
 * @property {string} address
 * @property {string} phone
 * @property {string} email
 * @property {number} tonnageSentOn
 */

/**
 * @typedef {Object} RecyclingActivity
 * @property {Supplier[]} suppliers
 * @property {number} totalTonnageReceived
 * @property {number} tonnageRecycled
 * @property {number} tonnageNotRecycled
 */

/**
 * @typedef {Object} ExportActivity
 * @property {Array<{orsId: string, siteName?: string, tonnageExported?: number}>} overseasSites
 * @property {number} totalTonnageReceivedForExporting
 * @property {number|null} tonnageReceivedNotExported
 * @property {number|null} tonnageRefusedAtRecepientDestination
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
 * @property {number} tonnageIssued
 * @property {number} totalRevenue
 * @property {number} averagePricePerTonne
 */

/**
 * @typedef {Object} SourceData
 * @property {string[]} summaryLogIds
 */

/**
 * @typedef {Object} Report
 * @property {string} id
 * @property {number} version
 * @property {number} schemaVersion
 * @property {ReportStatus} status
 * @property {StatusHistoryEntry[]} statusHistory
 * @property {string} [material]
 * @property {string} [wasteProcessingType]
 * @property {string} [siteAddress]
 * @property {RecyclingActivity} [recyclingActivity]
 * @property {ExportActivity} [exportActivity]
 * @property {WasteSent} [wasteSent]
 * @property {PrnData} [prnData]
 * @property {string} [supportingInformation]
 * @property {SourceData} [sourceData]
 */

/**
 * @typedef {Object} ReportPerPeriod
 * @property {string} startDate - ISO date string
 * @property {string} endDate - ISO date string
 * @property {string} dueDate - ISO date string
 * @property {string|null} currentReportId
 * @property {string[]} previousReportIds
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
 * @typedef {ReportPerPeriodKey & { newReportId: string|null, startDate: string, endDate: string, dueDate: string }} UpsertSlotParams
 */

/**
 * @typedef {Object.<string, ReportPerPeriod>} PeriodicReportSlots
 */

/**
 * @typedef {Object} PeriodicReport
 * @property {number} version
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
 * @property {string} startDate - ISO date string
 * @property {string} endDate - ISO date string
 * @property {string} dueDate - ISO date string
 * @property {UserSummary} changedBy
 * @property {string} [material]
 * @property {string} [wasteProcessingType]
 * @property {string} [siteAddress]
 * @property {RecyclingActivity} [recyclingActivity]
 * @property {ExportActivity} [exportActivity]
 * @property {WasteSent} [wasteSent]
 * @property {PrnData} [prnData]
 * @property {string} [supportingInformation]
 */

/**
 * @typedef {Object} UpdateReportParams
 * @property {string} reportId
 * @property {number} version - current version for optimistic locking
 * @property {{ status?: ReportStatus, supportingInformation?: string }} fields
 * @property {UserSummary} [changedBy]
 */

/**
 * @typedef {Object} DeleteReportParams
 * @property {string} organisationId - MongoDB ObjectId hex string
 * @property {string} registrationId - MongoDB ObjectId hex string
 * @property {number} year
 * @property {string} cadence - 'monthly' or 'quarterly'
 * @property {number} period
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
 * @property {(params: UpdateReportParams) => Promise<void>} updateReport
 * @property {(params: DeleteReportParams) => Promise<void>} deleteReport
 * @property {(params: FindPeriodicReportsParams) => Promise<PeriodicReport[]>} findPeriodicReports
 * @property {(reportId: string) => Promise<Report>} findReportById
 * @property {(reportIds: string[]) => Promise<Map<string, ReportStatus>>} findReportStatusesByIds
 */

/**
 * @typedef {() => ReportsRepository} ReportsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
