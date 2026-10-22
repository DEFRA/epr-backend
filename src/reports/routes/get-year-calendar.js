import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { yearCalendar } from '#reports/application/report-calendar.js'
import { readModelRegistration } from '#routes/organisations/natural-keys.js'
import { reportsYearCalendarResponseSchema } from './response.schema.js'
import { calendarQuerySchema } from './shared.js'

/**
 * @import { HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { ResolvedRecords, ResolvedRequest } from '#routes/organisations/at-natural-keys.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
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
   * @param {Omit<ResolvedRequest, 'app'> & { app: Required<ResolvedRecords>, reportsRepository: ReportsRepository }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation, registration } = request.app
    const year = /** @type {number} */ (request.params.year)

    const storedReports = await request.reportsRepository.findPeriodicReports({
      organisationId: organisation.id,
      registrationId: registration.id
    })

    const calendar = yearCalendar({
      registration: readModelRegistration(organisation, registration),
      storedReports,
      year,
      allSubmissions:
        /** @type {{ expand?: string }} */ (request.query).expand ===
        'submissions'
    })

    return h.response(calendar).code(StatusCodes.OK)
  }
}
