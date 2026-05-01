import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createReportForPeriod } from '#reports/application/report-service.js'
import { assertCadence } from '#reports/application/assert-cadence.js'
import { auditReportCreate } from '#reports/application/audit.js'
import {
  extractChangedBy,
  periodParamsSchema,
  standardUserAuth,
  withRegistrationDetails
} from './shared.js'

/**
 * @import { HapiRequest, HapiResponseToolkit, TypedLogger } from '#common/hapi-types.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteRecordsRepository } from '#repositories/waste-records/port.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js'
 * @import { PeriodPathParams } from './shared.js'
 */

export const reportsPostPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

/**
 * @param {TypedLogger} logger
 * @param {Error} error
 */
const logUnexpectedError = (logger, error) => {
  logger.error({
    err: error,
    message: `Failure on ${reportsPostPath}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
    },
    http: {
      response: {
        status_code: StatusCodes.INTERNAL_SERVER_ERROR
      }
    }
  })
}

export const reportsPost = {
  method: 'POST',
  path: reportsPostPath,
  options: {
    auth: standardUserAuth,
    tags: ['api'],
    validate: {
      params: periodParamsSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: PeriodPathParams,
   *   organisationsRepository: OrganisationsRepository,
   *   wasteRecordsRepository: WasteRecordsRepository,
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   reportsRepository: ReportsRepository,
   *   overseasSitesRepository: OverseasSitesRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const {
      organisationsRepository,
      wasteRecordsRepository,
      packagingRecyclingNotesRepository,
      reportsRepository,
      overseasSitesRepository,
      params,
      logger
    } = request
    const { organisationId, registrationId, year, cadence, period } = params

    try {
      const registration = await organisationsRepository.findRegistrationById(
        organisationId,
        registrationId
      )

      assertCadence(cadence, registration)

      const createdReport = await createReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        overseasSitesRepository,
        organisationId,
        registrationId,
        registration,
        year,
        cadence,
        period,
        changedBy: extractChangedBy(request.auth.credentials)
      })

      await auditReportCreate(request, {
        organisationId,
        registrationId,
        year,
        cadence,
        period,
        submissionNumber: createdReport.submissionNumber,
        reportId: createdReport.id,
        createdAt: createdReport.status.created.at
      })

      logger.info({
        message: `Report created: id=${createdReport.id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h
        .response(withRegistrationDetails(createdReport, registration))
        .code(StatusCodes.CREATED)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logUnexpectedError(logger, error)

      throw Boom.badImplementation(`Failure on ${reportsPostPath}`)
    }
  }
}
