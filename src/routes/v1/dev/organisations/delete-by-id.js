import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

/** @import {HapiRequest} from '#common/hapi-types.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * @typedef {HapiRequest & {
 *   organisationsRepository: OrganisationsRepository
 *   packagingRecyclingNotesRepository: {
 *     deleteByOrganisationId: (organisationId: string) => Promise<number>
 *   }
 *   wasteBalancesRepository: {
 *     deleteByAccreditationIds: (ids: string[]) => Promise<number>
 *   }
 *   reportsRepository: {
 *     deleteByOrganisationId: (organisationId: string) => Promise<number>
 *   }
 *   wasteRecordsRepository: {
 *     deleteByOrganisationId: (organisationId: string) => Promise<number>
 *   }
 *   summaryLogsRepository: {
 *     deleteByOrganisationId: (organisationId: string) => Promise<number>
 *   }
 *   overseasSitesRepository: {
 *     deleteByIds: (ids: string[]) => Promise<number>
 *   }
 *   params: { id: string }
 * }} DeleteByIdRequest
 */

export const devOrganisationsDeleteByIdPath = '/v1/dev/organisations/{id}'

const params = Joi.object({
  id: Joi.string().trim().min(1).required()
}).messages({
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.min': '{#label} cannot be empty'
})

const collectOrganisationKeys = (organisation) => {
  const accreditationIds = organisation.accreditations.map((a) => a.id)
  const overseasSiteIds = organisation.registrations.flatMap((reg) =>
    Object.values(reg.overseasSites ?? {}).map((entry) => entry.overseasSiteId)
  )
  return { accreditationIds, overseasSiteIds }
}

const findOrganisationOrNull = async (organisationsRepository, id) => {
  try {
    return await organisationsRepository.findById(id)
  } catch (error) {
    if (error?.output?.statusCode === StatusCodes.NOT_FOUND) {
      return null
    }
    throw error
  }
}

export const devOrganisationsDeleteById = {
  method: 'DELETE',
  path: devOrganisationsDeleteByIdPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      params
    }
  },

  /**
   * @param {DeleteByIdRequest} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      organisationsRepository,
      packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      reportsRepository,
      wasteRecordsRepository,
      summaryLogsRepository,
      overseasSitesRepository
    } = request

    const { id } = request.params

    const organisation = await findOrganisationOrNull(
      organisationsRepository,
      id
    )

    const { accreditationIds, overseasSiteIds } = organisation
      ? collectOrganisationKeys(organisation)
      : { accreditationIds: [], overseasSiteIds: [] }

    // Cascade downstream → root, each step idempotent via deleteMany semantics.
    const deletedCounts = {
      'packaging-recycling-notes':
        await packagingRecyclingNotesRepository.deleteByOrganisationId(id),
      'waste-balances':
        await wasteBalancesRepository.deleteByAccreditationIds(
          accreditationIds
        ),
      reports: await reportsRepository.deleteByOrganisationId(id),
      'waste-records': await wasteRecordsRepository.deleteByOrganisationId(id),
      'summary-logs': await summaryLogsRepository.deleteByOrganisationId(id),
      'overseas-sites':
        await overseasSitesRepository.deleteByIds(overseasSiteIds),
      'epr-organisations': await organisationsRepository.deleteById(id)
    }

    return h.response({ orgId: id, deletedCounts }).code(StatusCodes.OK)
  }
}
