import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createReportForPeriod } from '#reports/application/report-service.js'
import { auditReportCreate } from '#reports/application/audit.js'
import { CADENCE } from '#reports/domain/cadence.js'
import {
  periodParamsSchema,
  standardUserAuth,
  withRegistrationDetails,
  extractChangedBy
} from './shared.js'

export const reportsPostPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

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

      const expectedCadence = registration.accreditationId
        ? CADENCE.monthly
        : CADENCE.quarterly

      if (cadence !== expectedCadence) {
        throw Boom.badRequest(
          `Cadence '${cadence}' does not match registration type — expected '${expectedCadence}'`
        )
      }

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

      throw error
    }
  }
}
