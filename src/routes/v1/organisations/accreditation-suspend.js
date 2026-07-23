import { SCOPES } from '#common/helpers/auth/constants.js'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/organisations.js'
import { assertRegAccStatusTransitionValid } from '#domain/organisations/status.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationReplacement} OrganisationReplacement */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */

export const accreditationSuspendPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/suspend'

export const accreditationSuspend = {
  method: 'POST',
  path: accreditationSuspendPath,
  options: {
    auth: {
      scope: [SCOPES.adminWrite]
    },
    tags: ['api', 'admin']
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *    organisationsRepository: OrganisationsRepository,
   *    systemLogsRepository: SystemLogsRepository,
   *    params: { organisationId: string, registrationId: string, accreditationId: string }
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { organisationId, accreditationId } = request.params

    const [accreditation, initial] = await Promise.all([
      organisationsRepository.findAccreditationById(
        organisationId,
        accreditationId
      ),
      organisationsRepository.findById(organisationId)
    ])

    // Route-level check is required, not belt-and-braces: the repository's
    // assertAndHandleItemStateTransition skips validation when the status is
    // unchanged, so suspended -> suspended via replace() would otherwise be a
    // silent no-op instead of the required 422.
    assertRegAccStatusTransitionValid(
      accreditation.status,
      REG_ACC_STATUS.SUSPENDED
    )

    const { id, version, ...orgFields } = initial

    /** @type {OrganisationReplacement} */
    const updates = {
      ...orgFields,
      accreditations: initial.accreditations.map((acc) =>
        acc.id === accreditationId
          ? // The transition assert above guarantees the target is approved,
            // and 'suspended' is a valid status on an approved accreditation.
            /** @type {typeof acc} */ ({
              ...acc,
              status: REG_ACC_STATUS.SUSPENDED
            })
          : acc
      )
    }

    await organisationsRepository.replace(id, version, updates)
    const updated = await organisationsRepository.findById(id, version + 1)
    await auditOrganisationUpdate(request, id, initial, updated)

    return h.response({ status: REG_ACC_STATUS.SUSPENDED }).code(StatusCodes.OK)
  }
}
