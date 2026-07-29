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
   * @param {import('#common/hapi-types.js').HapiRequest<{
   *    fromStatus: RegistrationStatus,
   *    toStatus: RegistrationStatus,
   *    appliesFrom: string,
   *    registrationNumber: string
   * }> & {
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
    const { fromStatus, toStatus, appliesFrom, registrationNumber } =
      request.payload

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

    // Kept even though the single created -> approved arm can never fail
    // this check today (Joi already restricts the schema to that one valid
    // pair): it mirrors accreditation-status-history.js and becomes
    // load-bearing the moment a second transition arm is added here, at
    // which point the repository's assertAndHandleItemStateTransition would
    // otherwise silently no-op an unchanged-status replace() instead of
    // 422ing.
    assertRegistrationStatusTransitionValid(fromStatus, toStatus)

    // Granting sets validFrom to appliesFrom but leaves validTo (owned by
    // the application data) untouched, so reject a window that would be
    // inverted. When validTo is absent the replace below 422s via the
    // schema guard requiring it on approved registrations.
    if (
      registration.validTo &&
      new Date(appliesFrom) > new Date(registration.validTo)
    ) {
      throw Boom.badData(
        `Cannot grant registration: appliesFrom ${appliesFrom} is after validTo ${registration.validTo}`
      )
    }

    // Granting issues the registration number, which must not already be in
    // use by any registration in any organisation, whatever its status.
    // This uniqueness is enforced here only: there is no unique index on
    // registrations.registrationNumber, so concurrent grants of the same
    // number are not blocked by the database.
    const holder =
      await organisationsRepository.findByRegistrationNumber(registrationNumber)
    if (holder) {
      throw Boom.badData(
        `Registration number ${registrationNumber} is already in use`
      )
    }

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
              registrationNumber,
              validFrom: appliesFrom
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
