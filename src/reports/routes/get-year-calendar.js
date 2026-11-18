import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { yearCalendar } from '#reports/application/report-calendar.js'
import { toPerson } from './report-resource.js'
import { reportsYearCalendarResponseSchema } from './response.schema.js'
import { calendarQuerySchema } from './shared.js'

/**
 * @import { HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { ReportListItem, ReportsRepository } from '#reports/repository/port.js'
 * @import { ReportRequest } from './shared.js'
 */

/**
 * @param {ReportListItem} report
 */
const toCalendarReport = ({
  status,
  submissionNumber,
  submittedAt,
  submittedBy
}) => ({
  status,
  submissionNumber,
  ...(submittedAt && { submittedAt }),
  ...(submittedBy && { submittedBy: toPerson(submittedBy) })
})

/**
 * @template {{ report: ReportListItem | null }} P
 * @param {P} period
 */
const toCalendarPeriod = ({ report, ...period }) => ({
  ...period,
  ...(report && { report: toCalendarReport(report) })
})

/**
 * @template {{ reportingPeriods: { report: ReportListItem | null }[] }} K
 * @param {K} kind
 */
const toCalendarKind = (kind) => ({
  ...kind,
  reportingPeriods: kind.reportingPeriods.map(toCalendarPeriod)
})

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

    const { registeredOnly, accredited, ...calendar } = yearCalendar({
      registration,
      storedReports,
      year,
      allSubmissions:
        /** @type {{ expand?: string }} */ (request.query).expand ===
        'submissions'
    })

    return h
      .response({
        ...calendar,
        ...(registeredOnly && {
          registeredOnly: toCalendarKind(registeredOnly)
        }),
        ...(accredited && { accredited: toCalendarKind(accredited) })
      })
      .code(StatusCodes.OK)
  }
}
