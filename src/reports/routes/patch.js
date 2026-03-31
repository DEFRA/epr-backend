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
  freePernTonnage: Joi.number().min(0)
}).min(1)

/**
 * Merges user-entered PRN data with the existing prn object and computes averagePricePerTonne.
 * @param {import('#reports/repository/port.js').PrnData } existingPrn
 * @param {number | undefined} totalRevenue
 * @param {number | undefined} freeTonnage
 * @returns {object}
 */
export function buildUpdatedPrn(existingPrn, totalRevenue, freeTonnage) {
  const updated = {
    ...existingPrn,
    totalRevenue:
      totalRevenue !== undefined ? totalRevenue : existingPrn.totalRevenue,
    freeTonnage:
      freeTonnage !== undefined ? freeTonnage : existingPrn.freeTonnage
  }

  if (
    updated.issuedTonnage >= 0 &&
    updated.totalRevenue != null &&
    updated.freeTonnage != null
  ) {
    const denominator = updated.issuedTonnage - updated.freeTonnage
    updated.averagePricePerTonne =
      denominator > 0 ? updated.totalRevenue / denominator : 0
  } else {
    updated.averagePricePerTonne = 0
  }

  return updated
}

/**
 * @param {object} payload
 * @param {import('#reports/repository/port.js').Report} report
 */
function validatePrnFields(payload, report) {
  const hasPrnFields = 'prnRevenue' in payload || 'freePernTonnage' in payload

  if (!hasPrnFields) {
    return
  }

  if (report.status.currentStatus !== REPORT_STATUS.IN_PROGRESS) {
    throw Boom.badRequest(
      `Cannot update PRN data for a report with status '${report.status.currentStatus}'`
    )
  }
  if (!report.prn) {
    throw Boom.badRequest(
      'Cannot update PRN data for a report with no PRN record'
    )
  }

  if (
    'freePernTonnage' in payload &&
    report.prn.issuedTonnage !== undefined &&
    payload.freePernTonnage > report.prn.issuedTonnage
  ) {
    throw Boom.badRequest(
      `freePernTonnage (${payload.freePernTonnage}) must not exceed total issued tonnage (${report.prn.issuedTonnage})`
    )
  }
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
   * @param {HapiRequest<{ supportingInformation?: string, prnRevenue?: number, freePernTonnage?: number }> & { reportsRepository: ReportsRepository }} request
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

    if (report.status.currentStatus === REPORT_STATUS.SUBMITTED) {
      throw Boom.badRequest(`Cannot update a submitted report`)
    }

    validatePrnFields(request.payload, report)

    const { prnRevenue, freePernTonnage, ...otherFields } = request.payload

    const fields = { ...otherFields }

    if (prnRevenue !== undefined || freePernTonnage !== undefined) {
      fields.prn = buildUpdatedPrn(report.prn, prnRevenue, freePernTonnage)
    }

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
