import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { fetchCurrentReport } from '#reports/application/report-service.js'
import { maxTwoDecimalPlaces } from '#reports/repository/schema.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
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
  prnRevenue: Joi.number().min(0).custom(maxTwoDecimalPlaces),
  freeTonnage: Joi.number().integer().min(0),
  tonnageRecycled: Joi.number().min(0).custom(maxTwoDecimalPlaces),
  tonnageNotRecycled: Joi.number().min(0).custom(maxTwoDecimalPlaces),
  tonnageNotExported: Joi.number().min(0).custom(maxTwoDecimalPlaces)
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
 * Guards against updates to report data fields when the report is not in progress.
 * @param {object} payload
 * @param {import('#reports/repository/port.js').Report} report
 * @param {object} registration
 */
function guardReportDataFields(payload, report, registration) {
  const hasPrnFields = 'prnRevenue' in payload || 'freeTonnage' in payload

  if (hasPrnFields && !report.prn) {
    throw Boom.badRequest(
      'Cannot update PRN data for a report with no PRN record'
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

  if ('tonnageNotExported' in payload) {
    const isRegisteredOnlyExporter =
      registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER &&
      !registration.accreditationId
    if (!isRegisteredOnlyExporter) {
      throw Boom.badRequest(
        'tonnageNotExported can only be set for registered-only exporters'
      )
    }
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
    tonnageNotExported,
    ...otherFields
  } = payload

  const fields = { ...otherFields }

  if (prnRevenue !== undefined || freeTonnage !== undefined) {
    fields.prn = buildUpdatedPrn(report.prn, prnRevenue, freeTonnage)
  }

  if (tonnageRecycled !== undefined || tonnageNotRecycled !== undefined) {
    fields.recyclingActivity = {
      ...report.recyclingActivity,
      ...(tonnageRecycled !== undefined && { tonnageRecycled }),
      ...(tonnageNotRecycled !== undefined && { tonnageNotRecycled })
    }
  }

  if (tonnageNotExported !== undefined) {
    fields.exportActivity = { tonnageReceivedNotExported: tonnageNotExported }
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
    const { organisationsRepository, reportsRepository, params } = request
    const { organisationId, registrationId, cadence } = params
    const year = Number(params.year)
    const period = Number(params.period)

    const [registration, report] = await Promise.all([
      organisationsRepository.findRegistrationById(
        organisationId,
        registrationId
      ),
      fetchCurrentReport(
        reportsRepository,
        organisationId,
        registrationId,
        year,
        cadence,
        period
      )
    ])

    if (!report) {
      throw Boom.notFound(
        `No report found for ${cadence} period ${period} of ${year}`
      )
    }

    request.logger.info(
      { reportId: report.id, status: report.status, version: report.version },
      'PATCH guard: report found'
    )

    if (report.status.currentStatus !== REPORT_STATUS.IN_PROGRESS) {
      request.logger.error(
        { reportId: report.id, status: report.status },
        'PATCH guard: status check failed'
      )
      throw Boom.badRequest(
        `Cannot update a report with status '${report.status.currentStatus}'`
      )
    }

    guardReportDataFields(request.payload, report, registration)

    const fields = buildUpdateFields(request.payload, report)

    const updated = await reportsRepository.updateReport({
      reportId: report.id,
      version: report.version,
      fields,
      changedBy: extractChangedBy(request.auth.credentials)
    })

    return h.response(updated).code(StatusCodes.OK)
  }
}

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 */
