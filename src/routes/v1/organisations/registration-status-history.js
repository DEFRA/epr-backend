import Boom from '@hapi/boom'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/organisations.js'
import { assertRegistrationStatusTransitionValid } from '#domain/organisations/status.js'
import { registrationStatusHistoryPayloadSchema } from './registration-status-history.schema.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationReplacement} OrganisationReplacement */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */
/** @typedef {import('#domain/organisations/model.js').RegistrationStatus} RegistrationStatus */

export const registrationStatusHistoryPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/status-history'

export const registrationStatusHistory = {
  method: 'POST',
  path: registrationStatusHistoryPath,
  options: {
    auth: {
      scope: [SCOPES.adminWrite]
    },
    tags: ['api', 'admin'],
    validate: {
      payload: registrationStatusHistoryPayloadSchema
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest<
   *    { fromStatus: RegistrationStatus, toStatus: RegistrationStatus } |
   *    {
   *      fromStatus: RegistrationStatus,
   *      toStatus: RegistrationStatus,
   *      validFrom: string,
   *      validTo: string,
   *      registrationNumber: string
   *    }
   * > & {
   *    organisationsRepository: OrganisationsRepository,
   *    systemLogsRepository: SystemLogsRepository,
   *    params: { organisationId: string, registrationId: string }
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { organisationId, registrationId } = request.params
    const payload = request.payload
    const { fromStatus, toStatus } = payload

    // The created -> approved arm of the payload schema requires both grant
    // fields; the other arms forbid them.
    const grant = 'registrationNumber' in payload ? payload : undefined

    const initial = await organisationsRepository.findById(organisationId)

    const registration = initial.registrations.find(
      (reg) => reg.id === registrationId
    )
    if (!registration) {
      throw Boom.notFound(`Registration with id ${registrationId} not found`)
    }

    if (registration.status !== fromStatus) {
      throw Boom.badData(
        `Cannot transition registration from ${fromStatus}: its status is ${registration.status}`
      )
    }

    // Route-level check is required, not belt-and-braces: the repository's
    // assertAndHandleItemStateTransition skips validation when the status is
    // unchanged, so a same-status replace() would otherwise be a silent
    // no-op instead of the required 422.
    assertRegistrationStatusTransitionValid(fromStatus, toStatus)

    if (grant) {
      // Granting sets the whole validity window, so compare the two supplied
      // dates against each other and reject an inverted window.
      if (new Date(grant.validFrom) > new Date(grant.validTo)) {
        throw Boom.badData(
          `Cannot grant registration: validFrom ${grant.validFrom} is after validTo ${grant.validTo}`
        )
      }

      // Granting issues the registration number, which must not already be
      // in use by any registration in any organisation, whatever its status.
      // This uniqueness is enforced here only: there is no unique index on
      // registrations.registrationNumber, so concurrent grants of the same
      // number are not blocked by the database.
      const holder = await organisationsRepository.findByRegistrationNumber(
        grant.registrationNumber
      )
      if (holder) {
        throw Boom.badData(
          `Registration number ${grant.registrationNumber} is already in use`
        )
      }
    }

    const grantFields = grant
      ? {
          registrationNumber: grant.registrationNumber,
          validFrom: grant.validFrom,
          validTo: grant.validTo
        }
      : {}

    const { id, version, ...orgFields } = initial

    /** @type {OrganisationReplacement} */
    const updates = {
      ...orgFields,
      registrations: initial.registrations.map((reg) =>
        reg.id === registrationId
          ? // The transition assert above guarantees the requested status is
            // reachable from the current one, so the result is a valid item.
            /** @type {typeof reg} */ ({
              ...reg,
              status: toStatus,
              ...grantFields
            })
          : reg
      )
    }

    await organisationsRepository.replace(id, version, updates)
    const updated = await organisationsRepository.findById(id, version + 1)
    await auditOrganisationUpdate(request, id, initial, updated)

    return h.response({ status: toStatus }).code(StatusCodes.OK)
  }
}
