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
 * @typedef {{ at: string, by: UserSummary }} ReportOperation
 */

/**
 * @typedef {{ status: ReportStatus, at: string, by: UserSummary }} ReportStatusHistoryItem
 */

/**
 * @typedef {Object} ReportStatusObject
 * @property {ReportStatus} currentStatus
 * @property {string} currentStatusAt - ISO timestamp
 * @property {ReportOperation} created
 * @property {ReportOperation} [ready]
 * @property {ReportOperation} [submitted]
 * @property {ReportStatusHistoryItem[]} history
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
 * @property {number} issuedTonnage
 * @property {number} [totalRevenue]
 * @property {number} [averagePricePerTonne]
 * @property {number} freeTonnage
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
 * @property {number} submissionNumber
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} dueDate
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
 */

/**
 * @typedef {Object} ReportSummary
 * @property {string} id
 * @property {ReportStatus} status
 * @property {number} submissionNumber
 */

/**
 * @typedef {Object} ReportPerPeriod
 * @property {string} startDate - ISO date string
 * @property {string} endDate - ISO date string
 * @property {string} dueDate - ISO date string
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
 * @property {string} startDate - ISO date string
 * @property {string} endDate - ISO date string
 * @property {string} dueDate - ISO date string
 * @property {UserSummary} changedBy
 * @property {number} submissionNumber
 * @property {string} [material]
 * @property {string} [wasteProcessingType]
 * @property {string} [siteAddress]
 * @property {RecyclingActivity} [recyclingActivity]
 * @property {ExportActivity} [exportActivity]
 * @property {WasteSent} [wasteSent]
 * @property {PrnData} [prn]
 * @property {string} [supportingInformation]
 */

/**
 * @typedef {Object} UpdateReportParams
 * @property {string} reportId
 * @property {number} version - current version for optimistic locking
 * @property {{ status?: ReportStatus, supportingInformation?: string, prn?: Partial<PrnData>, recyclingActivity?: Partial<RecyclingActivity> }} fields
 * @property {UserSummary} [changedBy]
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
 * @property {(params: UpdateReportParams) => Promise<void>} updateReport
 * @property {(params: UpdateReportStatusParams) => Promise<void>} updateReportStatus
 * @property {(params: DeleteReportParams) => Promise<void>} deleteReport
 * @property {(params: FindPeriodicReportsParams) => Promise<PeriodicReport[]>} findPeriodicReports
 * @property {(reportId: string) => Promise<Report>} findReportById
 */

/**
 * @typedef {() => ReportsRepository} ReportsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
