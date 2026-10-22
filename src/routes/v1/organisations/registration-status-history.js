import Boom from '@hapi/boom'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/organisations.js'
import {
  registrationStatusHistoryPayloadSchema,
  registrationStatusTransitionSchema
} from './registration-status-history.schema.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationReplacement} OrganisationReplacement */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */
/** @typedef {import('#domain/organisations/model.js').RegistrationStatus} RegistrationStatus */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */

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
   *    { toStatus: RegistrationStatus } |
   *    {
   *      toStatus: RegistrationStatus,
   *      validFrom: string,
   *      registrationNumber: RegistrationNumber
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
    const { toStatus } = payload

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

    // Only built transitions are accepted, so a move the domain allows but
    // nothing offers (approved -> created) or a same-status no-op, which the
    // repository would silently skip, is a 422.
    const { error } = registrationStatusTransitionSchema.validate(
      Object.assign({ fromStatus: registration.status }, payload)
    )
    if (error) {
      throw Boom.badData(
        `Cannot transition registration from ${registration.status} to ${toStatus}`
      )
    }

    if (grant) {
      // Granting issues the registration number, which must not already be
      // in use by any registration in any organisation, whatever its status.
      // The unique index on registrations.registrationNumber also blocks
      // concurrent grants of the same number; this check gives the clear 422.
      const inUse = await organisationsRepository.isRegistrationNumberInUse(
        grant.registrationNumber
      )
      if (inUse) {
        throw Boom.badData(
          `Registration number ${grant.registrationNumber} is already in use`
        )
      }
    }

    const grantFields = grant
      ? {
          registrationNumber: grant.registrationNumber,
          validFrom: grant.validFrom
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
