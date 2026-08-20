import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { toRegistrationSummary } from '#application/organisations/registration-summary.js'
import { organisationsOverviewResponseSchema } from './response.schema.js'

export const organisationsOverviewGetPath =
  '/v1/organisations/{organisationId}/overview'

export const organisationsOverviewGet = {
  method: 'GET',
  path: organisationsOverviewGetPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin'],
    response: {
      schema: organisationsOverviewResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   params: { organisationId: string }
   * }} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationsRepository, logger } = request

    const organisationId = request.params.organisationId.trim()

    if (!organisationId) {
      throw Boom.notFound('Organisation not found')
    }

    try {
      const organisation =
        await organisationsRepository.findById(organisationId)

      const accreditationsById = new Map(
        organisation.accreditations.map((acc) => [acc.id, acc])
      )

      const registrations = organisation.registrations.map((reg) => {
        const linkedAccreditation = reg.accreditationId
          ? accreditationsById.get(reg.accreditationId)
          : undefined

        return {
          ...toRegistrationSummary(reg),
          ...(linkedAccreditation && {
            accreditation: {
              id: linkedAccreditation.id,
              accreditationNumber: linkedAccreditation.accreditationNumber,
              status: linkedAccreditation.status
            }
          })
        }
      })

      const response = {
        id: organisation.id,
        companyName: organisation.companyDetails.name,
        registrations
      }

      if (organisation.linkedDefraOrganisation) {
        const { orgId, orgName, linkedAt, linkedBy } =
          organisation.linkedDefraOrganisation
        response.linkedDefraOrganisation = {
          orgId,
          orgName,
          linkedAt,
          linkedBy: { email: linkedBy.email }
        }
      }

      return h.response(response).code(StatusCodes.OK)
    } catch (error) {
      if (Boom.isBoom(error)) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${organisationsOverviewGetPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: StatusCodes.INTERNAL_SERVER_ERROR
          }
        }
      })

      throw Boom.badImplementation(`Failure on ${organisationsOverviewGetPath}`)
    }
  }
}
