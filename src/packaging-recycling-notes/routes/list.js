import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { mapToExternalPrn } from '#packaging-recycling-notes/application/external-prn-mapper.js'
import { createStatusesValidator } from '#packaging-recycling-notes/routes/validation.js'

/**
 * @import {PackagingRecyclingNotesRepository} from '#packaging-recycling-notes/repository/port.js'
 * @import {PackagingRecyclingNote, PrnStatus} from '#packaging-recycling-notes/domain/model.js'
 * @import {ExternalPrnIds} from '#packaging-recycling-notes/application/external-prn-mapper.js'
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 */

/**
 * The external API still states the database ids of each PRN's issuing
 * organisation and accreditation, which PRNs no longer store, so they are
 * looked up by number: one read per organisation on the page.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {PackagingRecyclingNote[]} prns
 * @returns {Promise<(prn: PackagingRecyclingNote) => ExternalPrnIds>}
 */
const lookUpExternalIds = async (organisationsRepository, prns) => {
  const organisationNumbers = [
    ...new Set(prns.map((prn) => prn.organisation.organisationNumber))
  ]
  const organisations = new Map(
    await Promise.all(
      organisationNumbers.map(
        async (organisationNumber) =>
          /** @type {const} */ ([
            organisationNumber,
            await organisationsRepository.findByOrganisationNumber(
              organisationNumber
            )
          ])
      )
    )
  )

  return (prn) => {
    const organisation = organisations.get(prn.organisation.organisationNumber)
    const accreditation = organisation?.accreditations.find(
      ({ accreditationNumber }) =>
        accreditationNumber === prn.accreditation.accreditationNumber
    )
    if (!organisation || !accreditation) {
      throw Boom.badImplementation(
        `No stored accreditation ${prn.accreditation.accreditationNumber} for PRN ${prn.id}`
      )
    }
    return {
      organisationId: organisation.id,
      accreditationId: accreditation.id
    }
  }
}

const ALLOWED_STATUSES = ['awaiting_acceptance', 'cancelled']
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

export const packagingRecyclingNotesListPath = '/v1/packaging-recycling-notes'

export const packagingRecyclingNotesList = {
  method: 'GET',
  path: packagingRecyclingNotesListPath,
  options: {
    auth: { strategy: 'api-gateway-client' },
    tags: ['api'],
    validate: {
      query: Joi.object({
        statuses: createStatusesValidator(ALLOWED_STATUSES),
        dateFrom: Joi.string().isoDate().optional().messages({
          'string.isoDate': 'dateFrom must be a valid ISO 8601 date-time'
        }),
        dateTo: Joi.string().isoDate().optional().messages({
          'string.isoDate': 'dateTo must be a valid ISO 8601 date-time'
        }),
        limit: Joi.number().integer().min(1).optional(),
        cursor: Joi.string().optional()
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   organisationsRepository: OrganisationsRepository,
   *   query: {
   *     statuses: PrnStatus[],
   *     dateFrom?: string,
   *     dateTo?: string,
   *     limit?: number,
   *     cursor?: string
   *   }
   * }} request
   */
  handler: async (request, h) => {
    const {
      packagingRecyclingNotesRepository,
      organisationsRepository,
      logger
    } = request
    const { statuses, dateFrom, dateTo, limit, cursor } = request.query

    try {
      const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)

      const result = await packagingRecyclingNotesRepository.findByStatus({
        cursor,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        limit: effectiveLimit,
        statuses
      })

      const externalIdsOf = await lookUpExternalIds(
        organisationsRepository,
        result.items
      )
      const response = {
        items: result.items.map((prn) =>
          mapToExternalPrn(prn, externalIdsOf(prn))
        ),
        hasMore: result.hasMore
      }

      if (result.nextCursor) {
        response.nextCursor = result.nextCursor
      }

      logger.info({
        message: `Listed ${response.items.length} PRNs`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response(response).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${packagingRecyclingNotesListPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(
        `Failure on ${packagingRecyclingNotesListPath}`
      )
    }
  }
}
