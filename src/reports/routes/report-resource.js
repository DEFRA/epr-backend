import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  cadenceSchema,
  exportActivitySchema,
  periodSchema,
  prnSchema,
  recyclingActivitySchema,
  wasteSentSchema
} from '#reports/repository/schema.js'

/**
 * @import { AggregatedReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
 * @import { Issue } from '#reports/application/report-mandatory/assert-report-data-complete.js'
 * @import { ExportActivity, PrnData, RecyclingActivity, Report, ReportResubmissionRequired, ReportSource, ReportStale, ReportStatus as StoredStatus, ReportStatusObject, ReportSubmittedSlot, UserSummary, WasteSent } from '#reports/repository/port.js'
 */

/**
 * @typedef {{ total: number, issues: Issue[] }} IncompleteSummaryLogRows
 *
 * @typedef {Report & { canRequestResubmission: boolean }} StoredReportBody
 *
 * @typedef {AggregatedReportDetail & {
 *   prn: { issuedTonnage: number } | null,
 *   canRequestResubmission: boolean,
 *   incompleteSummaryLogRows?: IncompleteSummaryLogRows
 * }} PreviewBody
 *
 * @typedef {{ name?: string, position: string }} Person
 *
 * @typedef {Omit<RecyclingActivity, 'tonnageRecycled' | 'tonnageNotRecycled'>
 *   & Partial<Pick<RecyclingActivity, 'tonnageRecycled' | 'tonnageNotRecycled'>>} ServedRecyclingActivity
 *
 * @typedef {{
 *   year: number,
 *   cadence: string,
 *   period: number,
 *   submissionNumber: number,
 *   startDate: string,
 *   endDate: string,
 *   dueDate?: string,
 *   status: StoredStatus | typeof PREVIEW_STATUS,
 *   submittedAt?: string,
 *   submittedBy?: Person,
 *   version?: number,
 *   canRequestResubmission: boolean,
 *   recyclingActivity?: ServedRecyclingActivity,
 *   exportActivity?: ExportActivity,
 *   wasteSent?: WasteSent,
 *   prn?: PrnData,
 *   supportingInformation?: string,
 *   source?: { summaryLogId: string, lastUploadedAt: string | null },
 *   stale?: { summaryLogChanged?: { uploadedAt: string }, prnCancelled?: { occurredAt: string } },
 *   resubmissionRequired?: { closedPeriodRestated?: { uploadedAt: string }, operatorRequested?: { requestedAt: string, requestedBy: Person } },
 *   incompleteSummaryLogRows?: IncompleteSummaryLogRows
 * }} ReportResource
 */

/** Status of a report that has not been created yet. Never stored. */
export const PREVIEW_STATUS = /** @type {const} */ ('not_started')

/**
 * @param {UserSummary} user
 * @returns {Person}
 */
const toPerson = ({ name, position }) => ({ ...(name && { name }), position })

/**
 * @param {ReportStatusObject} status
 */
const submission = (status) => {
  if (status.currentStatus !== REPORT_STATUS.SUBMITTED) {
    return {}
  }
  const { at, by } = /** @type {ReportSubmittedSlot} */ (status.submitted)
  return { submittedAt: at, submittedBy: toPerson(by) }
}

/**
 * @param {ReportSource | undefined} source
 */
const submittedSource = (source) =>
  source?.summaryLogId
    ? {
        source: {
          summaryLogId: source.summaryLogId,
          lastUploadedAt: source.lastUploadedAt
        }
      }
    : {}

/**
 * @param {ReportStale} stale
 */
const toStale = ({ summaryLogChanged, prnCancelled }) => ({
  ...(summaryLogChanged && {
    summaryLogChanged: { uploadedAt: summaryLogChanged.uploadedAt }
  }),
  ...(prnCancelled && { prnCancelled: { occurredAt: prnCancelled.occurredAt } })
})

/**
 * @param {ReportResubmissionRequired} resubmissionRequired
 */
const toResubmissionRequired = ({
  closedPeriodRestated,
  operatorRequested
}) => ({
  ...(closedPeriodRestated && {
    closedPeriodRestated: { uploadedAt: closedPeriodRestated.uploadedAt }
  }),
  ...(operatorRequested && {
    operatorRequested: {
      requestedAt: operatorRequested.requestedAt,
      requestedBy: toPerson(operatorRequested.requestedBy)
    }
  })
})

/**
 * @param {StoredReportBody} report
 */
const toStoredResource = (report) => ({
  year: report.year,
  cadence: report.cadence,
  period: report.period,
  submissionNumber: report.submissionNumber,
  startDate: report.startDate,
  endDate: report.endDate,
  dueDate: report.dueDate,
  status: report.status.currentStatus,
  ...submission(report.status),
  version: report.version,
  canRequestResubmission: report.canRequestResubmission,
  recyclingActivity: report.recyclingActivity,
  ...(report.exportActivity && { exportActivity: report.exportActivity }),
  wasteSent: report.wasteSent,
  ...(report.prn && { prn: report.prn }),
  ...(report.supportingInformation !== undefined && {
    supportingInformation: report.supportingInformation
  }),
  ...submittedSource(report.source),
  ...(report.stale && { stale: toStale(report.stale) }),
  ...(report.resubmissionRequired && {
    resubmissionRequired: toResubmissionRequired(report.resubmissionRequired)
  })
})

/**
 * @param {PreviewBody} preview
 * @param {number} submissionNumber
 */
const toPreviewResource = (preview, submissionNumber) => ({
  year: preview.year,
  cadence: preview.cadence,
  period: preview.period,
  submissionNumber,
  startDate: preview.startDate,
  endDate: preview.endDate,
  status: PREVIEW_STATUS,
  canRequestResubmission: preview.canRequestResubmission,
  recyclingActivity: {
    suppliers: preview.recyclingActivity.suppliers,
    totalTonnageReceived: preview.recyclingActivity.totalTonnageReceived
  },
  ...(preview.exportActivity && { exportActivity: preview.exportActivity }),
  wasteSent: preview.wasteSent,
  ...(preview.prn && { prn: { issuedTonnage: preview.prn.issuedTonnage } }),
  ...submittedSource(preview.source),
  ...(preview.incompleteSummaryLogRows && {
    incompleteSummaryLogRows: preview.incompleteSummaryLogRows
  })
})

/**
 * Maps the report detail body (stored report or generated preview) to the
 * body the natural-key report routes serve.
 * @param {StoredReportBody | PreviewBody} body
 * @param {{ submissionNumber: number }} options
 * @returns {ReportResource}
 */
export const toReportResource = (body, { submissionNumber }) =>
  'diagnostics' in body
    ? toPreviewResource(body, submissionNumber)
    : toStoredResource(body)

const personSchema = Joi.object({
  name: Joi.string(),
  position: Joi.string().required()
})

const sourceSchema = Joi.object({
  summaryLogId: Joi.string().required(),
  lastUploadedAt: Joi.string().isoDate().required()
})

const staleSchema = Joi.object({
  summaryLogChanged: Joi.object({
    uploadedAt: Joi.string().isoDate().required()
  }),
  prnCancelled: Joi.object({ occurredAt: Joi.string().isoDate().required() })
})

const resubmissionRequiredSchema = Joi.object({
  closedPeriodRestated: Joi.object({
    uploadedAt: Joi.string().isoDate().required()
  }),
  operatorRequested: Joi.object({
    requestedAt: Joi.string().isoDate().required(),
    requestedBy: personSchema.required()
  })
})

const incompleteSummaryLogRowsSchema = Joi.object({
  total: Joi.number().integer().required(),
  issues: Joi.array()
    .items(
      Joi.object({
        sheet: Joi.string().required(),
        rowId: Joi.string().required(),
        field: Joi.string().required()
      })
    )
    .required()
})

const periodKeys = {
  year: yearSchema().required(),
  cadence: cadenceSchema,
  period: periodSchema,
  submissionNumber: Joi.number().integer().min(1).required(),
  startDate: Joi.string().isoDate().required(),
  endDate: Joi.string().isoDate().required(),
  canRequestResubmission: Joi.boolean().required(),
  exportActivity: exportActivitySchema,
  wasteSent: wasteSentSchema,
  source: sourceSchema
}

const storedReportSchema = Joi.object({
  ...periodKeys,
  dueDate: Joi.string().isoDate().required(),
  status: Joi.string()
    .valid(...Object.values(REPORT_STATUS))
    .required(),
  submittedAt: Joi.string().isoDate(),
  submittedBy: personSchema,
  version: Joi.number().integer().min(1).required(),
  recyclingActivity: recyclingActivitySchema,
  prn: prnSchema,
  supportingInformation: Joi.string().allow(''),
  stale: staleSchema,
  resubmissionRequired: resubmissionRequiredSchema
})

const previewSchema = Joi.object({
  ...periodKeys,
  status: Joi.string().valid(PREVIEW_STATUS).required(),
  recyclingActivity: recyclingActivitySchema.fork(
    ['tonnageRecycled', 'tonnageNotRecycled'],
    (key) => key.forbidden()
  ),
  prn: prnSchema.fork(
    ['totalRevenue', 'freeTonnage', 'averagePricePerTonne'],
    (key) => key.forbidden()
  ),
  incompleteSummaryLogRows: incompleteSummaryLogRowsSchema
})

export const reportResourceSchema = Joi.alternatives().try(
  storedReportSchema,
  previewSchema
)
