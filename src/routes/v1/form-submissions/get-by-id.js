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

    const organisations = await formSubmissionsRepository.findAllOrganisations()
    const organisation = organisations.find((o) => o.id === documentId) || null

    const linkedSubmissionsFilter = organisation
      ? (r) => r.referenceNumber === organisation.id // find registrations/accreditatons linked to the org
      : (r) => r.id === documentId // find registrations/accreditatons by supplied ID

    const allRegistrations =
      await formSubmissionsRepository.findAllRegistrations()
    const registrations = allRegistrations.filter(linkedSubmissionsFilter)

    const allAccreditations =
      await formSubmissionsRepository.findAllAccreditations()
    const accreditations = allAccreditations.filter(linkedSubmissionsFilter)

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
