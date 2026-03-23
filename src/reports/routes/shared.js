import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { cadenceSchema, periodSchema } from '#reports/repository/schema.js'

const MIN_YEAR = 2024
const MAX_YEAR = 2100

export const periodParamsSchema = Joi.object({
  organisationId: Joi.string().required(),
  registrationId: Joi.string().required(),
  year: Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR).required(),
  cadence: cadenceSchema,
  period: periodSchema
})

export const standardUserAuth = getAuthConfig([ROLES.standardUser])

/**
 * Wraps a report (stored or computed) with registration details.
 * @param {object} report
 * @param {object} registration
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
 * Finds the current report ID for a specific period slot.
 * @param {import('../repository/port.js').PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {string} cadence
 * @param {number} period
 * @returns {string|null}
 */
export function findCurrentReportId(periodicReports, year, cadence, period) {
  const periodicReport = periodicReports.find((pr) => pr.year === year)
  return periodicReport?.reports?.[cadence]?.[period]?.currentReportId ?? null
}

/**
 * Extracts a changedBy user summary from request credentials.
 * @param {object} credentials
 * @returns {{ id: string, name: string, position: string }}
 */
export function extractChangedBy(credentials) {
  return {
    id: credentials.id,
    name: credentials.name ?? credentials.email,
    position: credentials.position ?? 'User'
  }
}
