import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsOverviewGetPath =
  '/v1/organisations/{organisationId}/overview'

export const organisationsOverviewGet = {
  method: 'GET',
  path: organisationsOverviewGetPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api', 'admin']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
   *   params: { organisationId: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const organisationId = request.params.organisationId.trim()

    if (!organisationId) {
      throw Boom.notFound('Organisation not found')
    }

    const organisation = await organisationsRepository.findById(organisationId)

    const accreditationsById = new Map(
      organisation.accreditations.map((acc) => [acc.id, acc])
    )

    const registrations = organisation.registrations.map((reg) => {
      const linkedAccreditation = reg.accreditationId
        ? accreditationsById.get(reg.accreditationId)
        : undefined

      const isExporter =
        reg.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER

      return {
        id: reg.id,
        registrationNumber: reg.registrationNumber,
        status: reg.status,
        material: reg.material,
        processingType: getProcessingType(reg),
        site: isExporter ? null : reg.site?.address?.line1,
        ...(linkedAccreditation && {
          accreditation: {
            id: linkedAccreditation.id,
            accreditationNumber: linkedAccreditation.accreditationNumber,
            status: linkedAccreditation.status
          }
        })
      }
    })

    return h
      .response({
        id: organisation.id,
        companyName: organisation.companyDetails.name,
        registrations
      })
      .code(StatusCodes.OK)
  }
}

/**
 * @param {{ wasteProcessingType: string, reprocessingType?: string | null }} registration
 * @returns {string}
 */
function getProcessingType(registration) {
  if (registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return WASTE_PROCESSING_TYPE.EXPORTER
  }
  return registration.reprocessingType
    ? `${WASTE_PROCESSING_TYPE.REPROCESSOR} - ${registration.reprocessingType}`
    : WASTE_PROCESSING_TYPE.REPROCESSOR
}
