import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { yearCalendar } from '#reports/application/report-calendar.js'
import { reportsYearCalendarResponseSchema } from './response.schema.js'
import { calendarQuerySchema } from './shared.js'

/**
 * @import { HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { ReportRequest } from './shared.js'
 */

export const reportsYearCalendar = {
  method: 'GET',
  options: {
    auth: getAuthConfig([SCOPES.organisationRead, SCOPES.adminRead]),
    tags: ['api'],
    validate: { query: calendarQuerySchema },
    response: { schema: reportsYearCalendarResponseSchema }
  },
  /**
   * @param {ReportRequest & { params: { year: Year }, reportsRepository: ReportsRepository }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationNumber, registrationNumber, year } = request.params
    const { registration } = request.app

    const storedReports = await request.reportsRepository.findPeriodicReports({
      organisationNumber,
      registrationNumber
    })

    const calendar = yearCalendar({
      registration,
      storedReports,
      year,
      allSubmissions:
        /** @type {{ expand?: string }} */ (request.query).expand ===
        'submissions'
    })

    return h.response(calendar).code(StatusCodes.OK)
  }
}
