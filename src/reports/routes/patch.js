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

    const hasPrnFields =
      'prnRevenue' in request.payload || 'freePernTonnage' in request.payload

    if (hasPrnFields && report.status !== REPORT_STATUS.IN_PROGRESS) {
      throw Boom.badRequest(
        `Cannot update PRN data for a report with status '${report.status}'`
      )
    }

    if (
      'freePernTonnage' in request.payload &&
      report.prn?.issuedTonnage !== undefined &&
      request.payload.freePernTonnage > report.prn.issuedTonnage
    ) {
      throw Boom.badRequest(
        `freePernTonnage (${request.payload.freePernTonnage}) must not exceed total issued tonnage (${report.prn.issuedTonnage})`
      )
    }

    await reportsRepository.updateReport({
      reportId: report.id,
      version: report.version,
      fields: request.payload,
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
