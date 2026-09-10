import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
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

      const linkedAccreditationIds = new Set(
        organisation.registrations
          .map((reg) => reg.accreditationId)
          .filter((accreditationId) => !!accreditationId)
      )

      const registrations = organisation.registrations.map((reg) => {
        const linkedAccreditation = reg.accreditationId
          ? accreditationsById.get(reg.accreditationId)
          : undefined

        return {
          id: reg.id,
          registrationNumber: reg.registrationNumber,
          status: reg.status,
          material: reg.material,
          processingType: getProcessingType(reg),
          reprocessingType: reg.reprocessingType ?? null,
          site: getSite(reg),
          ...(linkedAccreditation && {
            accreditation: {
              id: linkedAccreditation.id,
              accreditationNumber: linkedAccreditation.accreditationNumber,
              status: linkedAccreditation.status
            }
          })
        }
      })

      // An accreditation is unlinked when no registration on this organisation
      // claims it. Nothing on the record itself says so, and nothing should:
      // the link lives on the registration.
      const unlinkedAccreditations = organisation.accreditations
        .filter((acc) => !linkedAccreditationIds.has(acc.id))
        .map((acc) => ({
          id: acc.id,
          accreditationNumber: acc.accreditationNumber,
          status: acc.status,
          material: acc.material,
          processingType: getProcessingType(acc),
          site: getSite(acc)
        }))

      const response = {
        id: organisation.id,
        companyName: organisation.companyDetails.name,
        registrations,
        unlinkedAccreditations
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

/**
 * Shared by registrations and accreditations so the overview table labels both
 * the same way.
 * @param {{ wasteProcessingType: string, reprocessingType?: string | null }} item
 * @returns {string}
 */
function getProcessingType(item) {
  if (item.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return WASTE_PROCESSING_TYPE.EXPORTER
  }
  return item.reprocessingType
    ? `${WASTE_PROCESSING_TYPE.REPROCESSOR} - ${item.reprocessingType}`
    : WASTE_PROCESSING_TYPE.REPROCESSOR
}

/**
 * @param {{ wasteProcessingType: string, site?: { address: { line1?: string } } }} item
 * @returns {string | null}
 */
function getSite(item) {
  if (item.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return null
  }
  // A reprocessor always has a site with a line1: the persistence schema
  // requires one of both registrations and accreditations.
  return /** @type {{ address: { line1: string } }} */ (item.site).address.line1
}
