import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { fetchCurrentReport } from '#reports/application/report-service.js'
import {
  periodParamsSchema,
  standardUserAuth,
  extractChangedBy
} from './shared.js'

export const reportsPatchPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

const MAX_SUPPORTING_INFO_LENGTH = 2000

const payloadSchema = Joi.object({
  supportingInformation: Joi.string().allow('').max(MAX_SUPPORTING_INFO_LENGTH),
  prnRevenue: Joi.number().min(0),
  freeTonnage: Joi.number().min(0),
  tonnageRecycled: Joi.number().min(0),
  tonnageNotRecycled: Joi.number().min(0)
}).min(1)

/**
 * Merges user-entered PRN data with the existing prn object and computes averagePricePerTonne.
 * @param {import('#reports/repository/port.js').PrnData | undefined} existingPrn
 * @param {number | undefined} prnRevenue
 * @param {number | undefined} freeTonnage
 * @returns {object}
 */
export function buildUpdatedPrn(existingPrn, prnRevenue, freeTonnage) {
  const base = existingPrn || {}
  const totalRevenue = prnRevenue !== undefined ? prnRevenue : base.totalRevenue
  const resolvedFree =
    freeTonnage !== undefined ? freeTonnage : base.freeTonnage
  const issued = base.issuedTonnage || 0
  const free = resolvedFree || 0
  const revenue = totalRevenue || 0
  const denominator = issued - free
  const averagePricePerTonne = denominator > 0 ? revenue / denominator : 0

  const updated = { ...base, averagePricePerTonne }

  if (totalRevenue !== undefined) {
    updated.totalRevenue = totalRevenue
  }

  if (resolvedFree !== undefined) {
    updated.freeTonnage = resolvedFree
  }

  return updated
}

/**
 * Guards against updates to report data fields when the report is not in progress.
 * @param {object} payload
 * @param {object} report
 */
function guardReportDataFields(payload, report) {
  const hasDataFields =
    'prnRevenue' in payload ||
    'freeTonnage' in payload ||
    'tonnageRecycled' in payload ||
    'tonnageNotRecycled' in payload

  if (hasDataFields && report.status !== REPORT_STATUS.IN_PROGRESS) {
    throw Boom.badRequest(
      `Cannot update report data for a report with status '${report.status}'`
    )
  }

  if (
    'freeTonnage' in payload &&
    report.prn?.issuedTonnage !== undefined &&
    payload.freeTonnage > report.prn.issuedTonnage
  ) {
    throw Boom.badRequest(
      `freeTonnage (${payload.freeTonnage}) must not exceed total issued tonnage (${report.prn.issuedTonnage})`
    )
  }
}

/**
 * Builds the update fields from the PATCH payload and existing report data.
 * @param {object} payload
 * @param {object} report
 * @returns {object}
 */
function buildUpdateFields(payload, report) {
  const {
    prnRevenue,
    freeTonnage,
    tonnageRecycled,
    tonnageNotRecycled,
    ...otherFields
  } = payload

  const fields = { ...otherFields }

  if (prnRevenue !== undefined || freeTonnage !== undefined) {
    fields.prn = buildUpdatedPrn(report.prn, prnRevenue, freeTonnage)
  }

  if (tonnageRecycled !== undefined || tonnageNotRecycled !== undefined) {
    fields.recyclingActivity = {
      ...(report.recyclingActivity || {}),
      ...(tonnageRecycled !== undefined && { tonnageRecycled }),
      ...(tonnageNotRecycled !== undefined && { tonnageNotRecycled })
    }
  }

  return fields
}

export const reportsPatch = {
  method: 'PATCH',
  path: reportsPatchPath,
  options: {
    auth: standardUserAuth,
    tags: ['api'],
    validate: {
      params: periodParamsSchema,
      payload: payloadSchema
    }
  },
  /**
   * @param {HapiRequest<{ supportingInformation?: string, prnRevenue?: number, freeTonnage?: number, tonnageRecycled?: number, tonnageNotRecycled?: number }> & { reportsRepository: ReportsRepository }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { reportsRepository, params } = request
    const { organisationId, registrationId, cadence } = params
    const year = Number(params.year)
    const period = Number(params.period)

    const report = await fetchCurrentReport(
      reportsRepository,
      organisationId,
      registrationId,
      year,
      cadence,
      period
    )

    if (!report) {
      throw Boom.notFound(
        `No report found for ${cadence} period ${period} of ${year}`
      )
    }

    guardReportDataFields(request.payload, report)

    const fields = buildUpdateFields(request.payload, report)

    await reportsRepository.updateReport({
      reportId: report.id,
      version: report.version,
      fields,
      changedBy: extractChangedBy(request.auth.credentials)
    })

    const updated = await reportsRepository.findReportById(report.id)

    return h.response(updated).code(StatusCodes.OK)
  }
}

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 */
