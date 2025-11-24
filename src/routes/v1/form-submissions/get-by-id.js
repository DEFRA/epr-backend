import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'

/** @typedef {import('#repositories/form-submissions/port.js').FormSubmissionsRepository} FormSubmissionsRepository */

export const formSubmissionsDataGet = {
  method: 'GET',
  path: '/v1/form-submissions/{documentId}',
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {formSubmissionsRepository: FormSubmissionsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ formSubmissionsRepository, params }, h) => {
    const documentId = params.documentId

    const organisation =
      await formSubmissionsRepository.findOrganisationById(documentId)

    const [registrations, accreditations] = organisation
      ? await Promise.all([
          formSubmissionsRepository.findRegistrationsBySystemReference(
            organisation.id
          ),
          formSubmissionsRepository.findAccreditationsBySystemReference(
            organisation.id
          )
        ])
      : await Promise.all([
          formSubmissionsRepository
            .findRegistrationById(documentId)
            .then((reg) => (reg ? [reg] : [])),
          formSubmissionsRepository
            .findAccreditationById(documentId)
            .then((acc) => (acc ? [acc] : []))
        ])

    const data = {
      organisation,
      registrations,
      accreditations
    }

    const statusCode =
      organisation || registrations.length || accreditations.length
        ? StatusCodes.OK
        : StatusCodes.NOT_FOUND

    return h.response(data).code(statusCode)
  }
}
