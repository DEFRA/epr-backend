import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { requiredReportingPeriods } from '#reports/application/report-calendar.js'
import { createReportForPeriod } from '#reports/application/report-service.js'
import { auditReportCreate } from '#reports/application/audit.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { extractChangedBy, withRegistrationDetails } from './shared.js'
import { reportDetailResponseSchema } from './response.schema.js'
import { reportResponseFailAction } from './response-fail-action.js'
import { cadenceAccreditationFor } from '#reports/domain/cadence.js'

/**
 * @import { HapiResponseToolkit, TypedLogger } from '#common/hapi-types.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 * @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { ReportRequest } from './shared.js'
 */

export const reportsPostFailureMessage = 'Failure on report create'

/**
 * @param {TypedLogger} logger
 * @param {string} reportId
 */
const logReportCreated = (logger, reportId) => {
  logger.info({
    message: `Report created: id=${reportId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
    }
  })
}

/**
 * @param {TypedLogger} logger
 * @param {Error} error
 */
const logUnexpectedError = (logger, error) => {
  logger.error({
    err: error,
    message: reportsPostFailureMessage,
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
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    tags: ['api'],
    response: {
      schema: reportDetailResponseSchema,
      failAction: reportResponseFailAction
    }
  },
  /**
   * @param {ReportRequest & {
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   reportsRepository: ReportsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const {
      ledgerRepository,
      summaryLogRowStatesRepository,
      packagingRecyclingNotesRepository,
      reportsRepository,
      params,
      logger
    } = request
    const {
      year,
      cadence,
      period,
      organisationNumber,
      registrationNumber,
      submissionNumber
    } = params
    const { registration, accreditation } = request.app

    try {
      // atReportKeys has already answered 404 for a monthly report whose
      // registration holds no accreditation for the year.
      const cadenceAccreditation = cadenceAccreditationFor(
        cadence,
        registration.accreditations[year]?.accreditationNumber
      )

      const createdReport = await createReportForPeriod({
        reportsRepository,
        ledgerRepository,
        summaryLogRowStatesRepository,
        packagingRecyclingNotesRepository,
        numbers: {
          registrationNumber,
          organisationNumber
        },
        reportRegistration: { registration, accreditation },
        year,
        cadenceAccreditation,
        period,
        submissionNumber,
        requiredPeriods: requiredReportingPeriods({
          registration,
          year,
          cadence
        }),
        changedBy: extractChangedBy(request.auth.credentials),
        reportDataValidationEnabled: request.config.get(
          'featureFlags.reportDataValidation'
        )
      })

      await auditReportCreate(request, {
        organisationNumber,
        registrationNumber,
        year,
        cadence,
        period,
        submissionNumber: createdReport.submissionNumber,
        reportId: createdReport.id,
        createdAt: createdReport.status.created.at
      })

      logReportCreated(logger, createdReport.id)

      return h
        .response(withRegistrationDetails(createdReport, registration))
        .code(StatusCodes.CREATED)
    } catch (error) {
      if (Boom.isBoom(error)) {
        throw error
      }

      logUnexpectedError(logger, /** @type {Error} */ (error))

      throw Boom.badImplementation(reportsPostFailureMessage)
    }
  }
}
