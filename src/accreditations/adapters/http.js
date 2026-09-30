import { StatusCodes } from 'http-status-codes'
import { fetchJson } from '#common/helpers/fetch-json.js'

/** @import { AccreditationsSource } from '../port.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

/**
 * The most registration ids sent in one request, keeping the query string
 * well inside URL length limits.
 */
const REGISTRATION_IDS_PER_REQUEST = 40

/**
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
const chunk = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  )

/**
 * Reads accreditations over HTTP from a service exposing the accreditation
 * endpoints — for the POC, this service itself.
 *
 * Requests go through `fetchJson`, which forwards the trace id of the request
 * being served, so the caller's and the endpoints' logs share one trace.
 *
 * @param {{ baseUrl: string, username: string, password: string }} options
 * @returns {AccreditationsSource}
 */
export const createHttpAccreditationsSource = ({
  baseUrl,
  username,
  password
}) => {
  const encodedBasicAuthCredentials = Buffer.from(
    `${username}:${password}`
  ).toString('base64')
  const headers = {
    Authorization: `Basic ${encodedBasicAuthCredentials}`
  }

  /**
   * @param {{ year: number, registrationIds?: string[] }} params
   * @returns {Promise<Accreditation[]>}
   */
  const listFor = ({ year, registrationIds = [] }) => {
    const query = new URLSearchParams({ year: String(year) })
    registrationIds.forEach((id) => query.append('registrationId', id))

    return fetchJson(`${baseUrl}/v1/accreditations?${query}`, { headers })
  }

  return {
    findForRegistration: async ({ registrationId, year }) => {
      try {
        return await fetchJson(
          `${baseUrl}/v1/registrations/${encodeURIComponent(registrationId)}/accreditations/${year}`,
          { headers }
        )
      } catch (error) {
        if (error.output?.statusCode === StatusCodes.NOT_FOUND) {
          return null
        }
        throw error
      }
    },

    list: async ({ year, registrationIds }) => {
      if (!registrationIds) {
        return listFor({ year })
      }

      const batches = await Promise.all(
        chunk(registrationIds, REGISTRATION_IDS_PER_REQUEST).map((ids) =>
          listFor({ year, registrationIds: ids })
        )
      )

      return batches.flat()
    }
  }
}
