import Boom from '@hapi/boom'
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
   * @param {import('#common/hapi-types.js').HapiRequest<
   *    { fromStatus: RegAccStatus, toStatus: RegAccStatus } |
   *    {
   *      fromStatus: RegAccStatus,
   *      toStatus: RegAccStatus,
   *      appliesFrom: string,
   *      accreditationNumber: string
   *    }
   * > & {
   *    organisationsRepository: OrganisationsRepository,
   *    systemLogsRepository: SystemLogsRepository,
   *    params: { organisationId: string, registrationId: string, accreditationId: string }
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { organisationId, registrationId, accreditationId } = request.params
    const payload = request.payload
    const { fromStatus, toStatus } = payload

    // The created -> approved arm of the payload schema requires both grant
    // fields; the other arms forbid them.
    const grant = 'accreditationNumber' in payload ? payload : undefined

    const initial = await organisationsRepository.findById(organisationId)

    const accreditation = initial.accreditations.find(
      (acc) => acc.id === accreditationId
    )
    if (!accreditation) {
      throw Boom.notFound(`Accreditation with id ${accreditationId} not found`)
    }

    const registration = initial.registrations.find(
      (reg) => reg.id === registrationId
    )
    if (registration?.accreditationId !== accreditationId) {
      throw Boom.notFound(
        `Accreditation with id ${accreditationId} not found on registration ${registrationId}`
      )
    }

    if (accreditation.status !== fromStatus) {
      throw Boom.badData(
        `Cannot transition accreditation from ${fromStatus}: its status is ${accreditation.status}`
      )
    }

    // Route-level check is required, not belt-and-braces: the repository's
    // assertAndHandleItemStateTransition skips validation when the status is
    // unchanged, so suspended -> suspended via replace() would otherwise be a
    // silent no-op instead of the required 422.
    assertRegAccStatusTransitionValid(fromStatus, toStatus)

    if (grant) {
      // Granting sets validFrom to appliesFrom but leaves validTo (owned by
      // the application data) untouched, so reject a window that would be
      // inverted. When validTo is absent the replace below 422s via the
      // schema guard requiring it on approved accreditations.
      if (
        accreditation.validTo &&
        new Date(grant.appliesFrom) > new Date(accreditation.validTo)
      ) {
        throw Boom.badData(
          `Cannot grant accreditation: appliesFrom ${grant.appliesFrom} is after validTo ${accreditation.validTo}`
        )
      }

      // Granting issues the accreditation number, which must not already be
      // in use by any accreditation in any organisation, whatever its status.
      // This uniqueness is enforced here only: there is no unique index on
      // accreditations.accreditationNumber, so concurrent grants of the same
      // number are not blocked by the database.
      const holder = await organisationsRepository.findByAccreditationNumber(
        grant.accreditationNumber
      )
      if (holder) {
        throw Boom.badData(
          `Accreditation number ${grant.accreditationNumber} is already in use`
        )
      }
    }

    const grantFields = grant
      ? {
          accreditationNumber: grant.accreditationNumber,
          validFrom: grant.appliesFrom
        }
      : {}

    const { id, version, ...orgFields } = initial

    /** @type {OrganisationReplacement} */
    const updates = {
      ...orgFields,
      accreditations: initial.accreditations.map((acc) =>
        acc.id === accreditationId
          ? // The transition assert above guarantees the requested status is
            // reachable from the current one, so the result is a valid item.
            /** @type {typeof acc} */ ({
              ...acc,
              status: toStatus,
              ...grantFields
            })
          : acc
      )
    }

    await organisationsRepository.replace(id, version, updates)
    const updated = await organisationsRepository.findById(id, version + 1)
    await auditOrganisationUpdate(request, id, initial, updated)

    return h.response({ status: toStatus }).code(StatusCodes.OK)
  }
}
