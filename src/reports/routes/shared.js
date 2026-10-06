import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { cadenceSchema, periodSchema } from '#reports/repository/schema.js'

export const submissionNumberSchema = Joi.number().integer().min(1).required()

export const periodParamsSchema = Joi.object({
  organisationId: Joi.string().required(),
  registrationId: Joi.string().required(),
  year: yearSchema().required(),
  cadence: cadenceSchema,
  period: periodSchema,
  submissionNumber: submissionNumberSchema
})

/**
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 *
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   year: number,
 *   cadence: Cadence,
 *   period: number
 * }} PeriodPathParams
 *
 * @typedef {PeriodPathParams & { submissionNumber: number }} PeriodWithSubmissionPathParams
 */

/**
 * Wraps a report (stored or computed) with registration details.
 * @param {object} report
 * @param {Registration} registration
 * @returns {object}
 */
export function withRegistrationDetails(report, registration) {
  return {
    ...report,
    details: {
      material: registration.material,
      site: registration.site
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
