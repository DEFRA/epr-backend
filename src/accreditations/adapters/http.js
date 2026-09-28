import { StatusCodes } from 'http-status-codes'
import { fetchJson } from '#common/helpers/fetch-json.js'

/** @import { AccreditationsSource } from '../port.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

/**
 * The most the list endpoint returns in a page.
 */
const PAGE_SIZE = 500

/**
 * The most registration ids sent in one request, keeping the query string
 * well inside URL length limits.
 */
const REGISTRATION_IDS_PER_REQUEST = 100

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
  const headers = {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  }

  /**
   * @param {{ year: number, registrationIds?: string[] }} params
   * @returns {Promise<Accreditation[]>}
   */
  const listPages = async ({ year, registrationIds = [] }) => {
    const records = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const query = new URLSearchParams({
        year: String(year),
        page: String(page),
        pageSize: String(PAGE_SIZE)
      })
      registrationIds.forEach((id) => query.append('registrationId', id))

      const body = await fetchJson(`${baseUrl}/v1/accreditations?${query}`, {
        headers
      })

      records.push(...body.items)
      totalPages = body.totalPages
      page += 1
    }

    return records
  }

  return {
    findForRegistration: async ({ registrationId, year }) => {
      try {
        return await fetchJson(
          `${baseUrl}/v1/registrations/${encodeURIComponent(registrationId)}/accreditation/${year}`,
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
        return listPages({ year })
      }

      const batches = await Promise.all(
        chunk(registrationIds, REGISTRATION_IDS_PER_REQUEST).map((ids) =>
          listPages({ year, registrationIds: ids })
        )
      )

      return batches.flat()
    }
  }
}
