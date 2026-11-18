import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { yearCalendar } from '#reports/application/report-calendar.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { toPerson } from './report-resource.js'
import { reportsYearCalendarResponseSchema } from './response.schema.js'
import { calendarQuerySchema } from './shared.js'

/**
 * @import { HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { ReportListItem, ReportStatus, ReportsRepository } from '#reports/repository/port.js'
 * @import { Person } from './report-resource.js'
 * @import { ReportRequest } from './shared.js'
 */

/**
 * @typedef {{
 *   status: ReportStatus,
 *   submissionNumber: number,
 *   submittedAt?: string,
 *   submittedBy?: Person
 * }} CalendarReport
 */

/**
 * A report keeps its last submission after it is unsubmitted, so only a
 * report submitted now serves one.
 * @param {ReportListItem} report
 * @returns {CalendarReport}
 */
const toCalendarReport = ({
  status,
  submissionNumber,
  submittedAt,
  submittedBy
}) => ({
  status,
  submissionNumber,
  ...(status === REPORT_STATUS.SUBMITTED &&
    submittedAt &&
    submittedBy && { submittedAt, submittedBy: toPerson(submittedBy) })
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
