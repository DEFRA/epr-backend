import Boom from '@hapi/boom'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/organisations.js'
import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import {
  accreditationStatusHistoryPayloadSchema,
  accreditationStatusTransitionSchema
} from './accreditation-status-history.schema.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationReplacement} OrganisationReplacement */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */
/** @typedef {import('#domain/organisations/model.js').AccreditationStatus} AccreditationStatus */
/** @import { AccreditationNumber } from '#domain/organisations/numbers.js' */

export const accreditationStatusHistoryPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/status-history'

/**
 * Grant-only validations. Granting sets the whole validity window from the
 * supplied dates, so reject a window that would be inverted. Granting also
 * issues the accreditation number, which must not already be in use by any
 * accreditation in any organisation, whatever its status. The unique index on
 * accreditations.accreditationNumber also blocks concurrent grants of the
 * same number; this check gives the clear 422.
 * @param {OrganisationsRepository} organisationsRepository
 * @param {{ validFrom: string, validTo: string, accreditationNumber: AccreditationNumber }} grant
 * @returns {Promise<void>}
 */
const assertGrantAllowed = async (organisationsRepository, grant) => {
  if (new Date(grant.validFrom) > new Date(grant.validTo)) {
    throw Boom.badData(
      `Cannot grant accreditation: validFrom ${grant.validFrom} is after validTo ${grant.validTo}`
    )
  }

  const inUse = await organisationsRepository.isAccreditationNumberInUse(
    grant.accreditationNumber
  )
  if (inUse) {
    throw Boom.badData(
      `Accreditation number ${grant.accreditationNumber} is already in use`
    )
  }
}

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
   *    { toStatus: AccreditationStatus } |
   *    {
   *      toStatus: AccreditationStatus,
   *      validFrom: string,
   *      validTo: string,
   *      accreditationNumber: AccreditationNumber
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
    const { toStatus } = payload

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

    // Only built transitions are accepted, so a move the domain allows but
    // nothing offers (approved -> created) or a same-status no-op, which the
    // repository would silently skip, is a 422.
    const { error } = accreditationStatusTransitionSchema.validate(
      Object.assign({ fromStatus: accreditation.status }, payload)
    )
    if (error) {
      throw Boom.badData(
        `Cannot transition accreditation from ${accreditation.status} to ${toStatus}`
      )
    }

    // Both to-approved arms (grant and reinstate) require the linked
    // registration to be approved (PAE-1800). Without this a cancelled
    // registration's cascade-cancelled accreditation could be "reinstated":
    // the repository cascade would hold it at cancelled while the endpoint
    // returned 200 — this guard makes the rejection explicit. Granting gets
    // the same clear message instead of validateApprovals' generic one.
    if (
      toStatus === ACCREDITATION_STATUS.APPROVED &&
      registration.status !== REGISTRATION_STATUS.APPROVED
    ) {
      throw Boom.badData(
        `Cannot transition accreditation to approved: its registration is ${registration.status}`
      )
    }

    if (grant) {
      await assertGrantAllowed(organisationsRepository, grant)
    }

    const grantFields = grant
      ? {
          accreditationNumber: grant.accreditationNumber,
          validFrom: grant.validFrom,
          validTo: grant.validTo
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
