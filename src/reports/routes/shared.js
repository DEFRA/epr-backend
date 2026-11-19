import Joi from 'joi'

export const calendarQuerySchema = Joi.object({
  expand: Joi.string().valid('submissions')
})

export const submissionNumberSchema = Joi.number().integer().min(1).required()

/**
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { Organisation, Registration as ReadModelRegistration } from '#organisation-read-model/domain/model.js'
 * @import { ReportRegistration } from '#reports/domain/operator-category.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { RegistrationParams } from '#routes/organisations/natural-keys.js'
 *
 * @typedef {RegistrationParams & {
 *   year: Year,
 *   cadence: Cadence,
 *   period: number
 * }} PeriodPathParams
 *
 * @typedef {PeriodPathParams & { submissionNumber: number }} PeriodWithSubmissionPathParams
 *
 * @typedef {ReportRegistration & { organisation: Organisation }} ReportRecords
 *
 * @typedef {HapiRequest & {
 *   params: PeriodWithSubmissionPathParams,
 *   app: ReportRecords
 * }} ReportRequest
 */

/**
 * Wraps a report (stored or computed) with registration details.
 * @param {object} report
 * @param {ReadModelRegistration} registration
 * @returns {object}
 */
export function withRegistrationDetails(report, registration) {
  return {
    ...report,
    details: {
      material: registration.material,
      site: 'site' in registration ? registration.site : undefined
    }
  }
}

/**
 * Extracts a changedBy user summary from request credentials.
 * Carries name and email distinctly: name is omitted when there is no real
 * name, and the email is never coerced into the name slot.
 * @param {{ email?: string, id: string, name?: string, position?: string }} credentials
 * @returns {{ id: string, name?: string, email?: string, position: string }}
 */
export function extractChangedBy(credentials) {
  return {
    id: credentials.id,
    ...(credentials.name && { name: credentials.name }),
    ...(credentials.email && { email: credentials.email }),
    position: credentials.position ?? 'User'
  }
}
