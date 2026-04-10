import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

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
      params
    } = request
    const { organisationId, registrationId, year, cadence, period } = params

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

    return h
      .response(withRegistrationDetails(createdReport, registration))
      .code(StatusCodes.CREATED)
  }
}
