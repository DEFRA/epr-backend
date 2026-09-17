import Boom from '@hapi/boom'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/organisations.js'
import {
  REGISTRATION_STATUS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { siteKey } from '#formsubmission/parsing-common/site.js'
import { accreditationRegistrationPayloadSchema } from './accreditation-registration.schema.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationReplacement} OrganisationReplacement */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */
/** @typedef {import('#domain/organisations/accreditation.js').Accreditation} Accreditation */
/** @typedef {import('#domain/organisations/registration.js').Registration} Registration */

// Deliberately not nested under a registration: an unlinked accreditation has
// none, which is the whole reason it cannot be reached by any other admin
// route.
export const accreditationRegistrationPath =
  '/v1/organisations/{organisationId}/accreditations/{accreditationId}/registration'

/**
 * The candidate rules. The material, processing type and site checks are not
 * belt-and-braces: those fields make up the registration/accreditation identity
 * key, so a mismatch would be rejected by validateAccreditationLinkMatches on
 * the write with a far vaguer message. Each rule reports its own reason.
 *
 * @param {Registration} registration
 * @param {Accreditation} accreditation
 * @returns {void}
 */
const assertRegistrationIsACandidate = (registration, accreditation) => {
  if (registration.status !== REGISTRATION_STATUS.APPROVED) {
    throw Boom.badData(
      `Cannot assign accreditation: registration ${registration.id} is ${registration.status}, not approved`
    )
  }

  if (registration.material !== accreditation.material) {
    throw Boom.badData(
      `Cannot assign accreditation: registration material ${registration.material} does not match accreditation material ${accreditation.material}`
    )
  }

  if (registration.wasteProcessingType !== accreditation.wasteProcessingType) {
    throw Boom.badData(
      `Cannot assign accreditation: registration processing type ${registration.wasteProcessingType} does not match accreditation processing type ${accreditation.wasteProcessingType}`
    )
  }

  if (
    registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR &&
    siteKey(registration.site) !== siteKey(accreditation.site)
  ) {
    throw Boom.badData(
      `Cannot assign accreditation: registration ${registration.id} is at a different site to the accreditation`
    )
  }

  // Copied onto the accreditation below, so there has to be one to copy.
  if (!registration.reprocessingType) {
    throw Boom.badData(
      `Cannot assign accreditation: registration ${registration.id} has no reprocessingType`
    )
  }

  if (registration.accreditationId) {
    throw Boom.badData(
      `Cannot assign accreditation: registration ${registration.id} is already linked to accreditation ${registration.accreditationId}`
    )
  }
}

export const accreditationRegistrationAssign = {
  method: 'POST',
  path: accreditationRegistrationPath,
  options: {
    auth: {
      scope: [SCOPES.adminWrite]
    },
    tags: ['api', 'admin'],
    validate: {
      payload: accreditationRegistrationPayloadSchema
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest<{ registrationId: string }> & {
   *    organisationsRepository: OrganisationsRepository,
   *    systemLogsRepository: SystemLogsRepository,
   *    params: { organisationId: string, accreditationId: string }
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { organisationId, accreditationId } = request.params
    const { registrationId } = request.payload

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
    if (!registration) {
      throw Boom.notFound(`Registration with id ${registrationId} not found`)
    }

    const currentHolder = initial.registrations.find(
      (reg) => reg.accreditationId === accreditationId
    )
    if (currentHolder) {
      throw Boom.badData(
        `Cannot assign accreditation: accreditation ${accreditationId} is already linked to registration ${currentHolder.id}`
      )
    }

    assertRegistrationIsACandidate(registration, accreditation)

    const { id, version, ...orgFields } = initial

    /** @type {OrganisationReplacement} */
    const updates = {
      ...orgFields,
      registrations: initial.registrations.map((reg) =>
        reg.id === registrationId
          ? /** @type {typeof reg} */ ({ ...reg, accreditationId })
          : reg
      ),
      // reprocessingType is part of the identity key, and an unlinked
      // accreditation has none. Copying it across in the same replace is what
      // makes the pair match — without it the write this very operation
      // performs would be rejected.
      accreditations: initial.accreditations.map((acc) =>
        acc.id === accreditationId
          ? /** @type {typeof acc} */ ({
              ...acc,
              reprocessingType: registration.reprocessingType
            })
          : acc
      )
    }

    await organisationsRepository.replace(id, version, updates)
    const updated = await organisationsRepository.findById(id, version + 1)
    await auditOrganisationUpdate(request, id, initial, updated)

    return h.response().code(StatusCodes.NO_CONTENT)
  }
}
