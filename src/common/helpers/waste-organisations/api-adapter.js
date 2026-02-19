import Boom from '@hapi/boom'

import { fetchJson } from '#common/helpers/fetch-json.js'
import { config } from '#root/config.js'

const PRODUCER_TYPES = new Set(['LARGE_PRODUCER', 'COMPLIANCE_SCHEME'])

/**
 * Extracts registrationType from the raw registrations array and warns
 * on missing or ambiguous producer registrations.
 * @param {Array<{ id: string; name: string; registrations?: Array<{ type: string; registrationYear: number | string }>; [key: string]: unknown }>} organisations
 * @param {{ warn: (data: object, message: string) => void }} logger
 * @param {number} currentYear
 * @returns {Array<{ id: string; name: string; tradingName?: string | null; registrationType?: string; [key: string]: unknown }>}
 */
function extractRegistrationTypes(organisations, logger, currentYear) {
  return organisations.map((org) => {
    const { registrations, ...rest } = org

    const producerRegs = registrations?.filter(
      (r) =>
        PRODUCER_TYPES.has(r.type) && Number(r.registrationYear) === currentYear
    )

    if (!producerRegs?.length) {
      logger.warn(
        { organisationId: org.id, organisationName: org.name },
        'Waste organisation has no producer registration for the current year — display name will fall back to tradingName preference'
      )
      return rest
    }

    const types = new Set(producerRegs.map((r) => r.type))
    if (types.size > 1) {
      logger.warn(
        { organisationId: org.id, organisationName: org.name },
        'Waste organisation has both LARGE_PRODUCER and COMPLIANCE_SCHEME registrations for the current year — likely bad data from RPD'
      )
    }

    return { ...rest, registrationType: producerRegs[0].type }
  })
}

/**
 * @typedef {{
 *   getOrganisationById: (id: string) => Promise<{ id: string; name: string; tradingName?: string | null; registrationType?: string; [key: string]: unknown }>
 * }} WasteOrganisationsService
 */

/**
 * Creates a waste organisations service that fetches from the real API.
 * @param {{ warn: (data: object, message: string) => void }} logger
 * @returns {WasteOrganisationsService}
 */
export function createApiWasteOrganisationsService(logger) {
  return {
    async getOrganisationById(id) {
      const { url, username, password, key } = config.get(
        'wasteOrganisationsApi'
      )
      const isDevelopment = config.get('isDevelopment')

      const currentYear = new Date().getFullYear()
      const params = new URLSearchParams({
        registrations: ['LARGE_PRODUCER', 'COMPLIANCE_SCHEME'],
        registrationYears: [String(currentYear)],
        statuses: ['REGISTERED']
      })

      const auth = Buffer.from(`${username}:${password}`).toString('base64')

      const response = await fetchJson(`${url}?${params.toString()}`, {
        headers: {
          ...(isDevelopment && { 'x-api-key': key }),
          authorization: `Basic ${auth}`
        }
      })

      const organisations = extractRegistrationTypes(
        response.organisations,
        logger,
        currentYear
      )
      const organisation = organisations.find((o) => o.id === id)

      if (!organisation) {
        throw Boom.notFound(
          `Organisation ${id} not found in waste organisations API`
        )
      }

      return organisation
    }
  }
}
