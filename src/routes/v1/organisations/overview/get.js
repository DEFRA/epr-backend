import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import { reportsGetPath } from '#reports/routes/get.js'

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

    const registrations = await Promise.all(
      organisation.registrations.map(async (reg) => {
        const linkedAccreditation = reg.accreditationId
          ? accreditationsById.get(reg.accreditationId)
          : undefined

        const calendarUrl = reportsGetPath
          .replace('{organisationId}', organisationId)
          .replace('{registrationId}', reg.id)

        const calendarResponse = await request.server.inject({
          method: 'GET',
          url: calendarUrl,
          auth: request.auth
        })

        const reports =
          calendarResponse.statusCode === StatusCodes.OK
            ? JSON.parse(calendarResponse.payload)
            : null

        return {
          id: reg.id,
          registrationNumber: reg.registrationNumber,
          status: reg.status,
          material: reg.material,
          ...(linkedAccreditation && {
            accreditation: {
              id: linkedAccreditation.id,
              accreditationNumber: linkedAccreditation.accreditationNumber,
              status: linkedAccreditation.status
            }
          }),
          reports
        }
      })
    )

    return h
      .response({
        id: organisation.id,
        companyName: organisation.companyDetails.name,
        registrations
      })
      .code(StatusCodes.OK)
  }
}
