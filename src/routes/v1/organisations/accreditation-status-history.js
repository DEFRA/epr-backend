import { SCOPES } from '#common/helpers/auth/constants.js'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/organisations.js'
import { assertRegAccStatusTransitionValid } from '#domain/organisations/status.js'
import { accreditationStatusHistoryPayloadSchema } from './accreditation-status-history.schema.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationReplacement} OrganisationReplacement */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */
/** @typedef {import('#domain/organisations/model.js').RegAccStatus} RegAccStatus */

export const accreditationStatusHistoryPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/status-history'

export const accreditationStatusHistory = {
  method: 'POST',
  path: accreditationStatusHistoryPath,
  options: {
    auth: {
      scope: [SCOPES.adminWrite]
    },
    tags: ['api', 'admin'],
    validate: {
      payload: accreditationStatusHistoryPayloadSchema
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest<{ status: RegAccStatus }> & {
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
    const { status } = request.payload

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
    assertRegAccStatusTransitionValid(accreditation.status, status)

    const { id, version, ...orgFields } = initial

    /** @type {OrganisationReplacement} */
    const updates = {
      ...orgFields,
      accreditations: initial.accreditations.map((acc) =>
        acc.id === accreditationId
          ? // The transition assert above guarantees the requested status is
            // reachable from the current one, so the result is a valid item.
            /** @type {typeof acc} */ ({ ...acc, status })
          : acc
      )
    }

    await organisationsRepository.replace(id, version, updates)
    const updated = await organisationsRepository.findById(id, version + 1)
    await auditOrganisationUpdate(request, id, initial, updated)

    return h.response({ status }).code(StatusCodes.OK)
  }
}
