import Joi from 'joi'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  REG_ACC_STATUS,
  ORGANISATION_STATUS
} from '#domain/organisations/model.js'
import { auditStatusTransition } from '#root/auditing/organisations.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/organisations/port.js').StatusTransitionTarget} StatusTransitionTarget */

const ORGANISATION_STATUSES = Object.values(ORGANISATION_STATUS)
const REGISTRATION_ACCREDITATION_STATUSES = Object.values(REG_ACC_STATUS)

/**
 * Build a function validator (this codebase has no Hapi Joi validator
 * registered) that only accepts the statuses valid for the resource type, so a
 * status that is structurally wrong for the resource fails as a 400 rather than
 * reaching the domain transition check as a 422.
 *
 * @param {string[]} allowedStatuses
 * @returns {(value: unknown) => { status: string, reason: string, version: number }}
 */
const buildPayloadValidator = (allowedStatuses) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(...allowedStatuses)
      .required(),
    reason: Joi.string().trim().min(1).required(),
    version: Joi.number().integer().required()
  })

  return (value) => {
    const { error, value: validated } = schema.validate(value)
    if (error) {
      throw Boom.badRequest(error.message)
    }
    return validated
  }
}

/**
 * Build the status-transition target from the route type and path params.
 *
 * @param {'organisation'|'registration'|'accreditation'} type
 * @param {{ params: Record<string, string> }} request
 * @returns {StatusTransitionTarget}
 */
const targetFor = (type, request) => {
  if (type === 'organisation') {
    return { type: 'organisation' }
  }
  if (type === 'registration') {
    return {
      type: 'registration',
      registrationId: request.params.registrationId
    }
  }
  return {
    type: 'accreditation',
    registrationId: request.params.registrationId,
    accreditationId: request.params.accreditationId
  }
}

/**
 * @param {{ type: 'organisation'|'registration'|'accreditation', path: string }} config
 */
const makeRoute = ({ type, path }) => {
  const validatePayload = buildPayloadValidator(
    type === 'organisation'
      ? ORGANISATION_STATUSES
      : REGISTRATION_ACCREDITATION_STATUSES
  )

  return {
    method: 'POST',
    path,
    options: {
      auth: {
        scope: [SCOPES.adminWrite]
      },
      tags: ['api', 'admin'],
      validate: {
        payload: validatePayload
      }
    },

    /**
     * @param {import('#common/hapi-types.js').HapiRequest<{status: string, reason: string, version: number}> & {
     *   organisationsRepository: OrganisationsRepository
     * }} request
     * @param {import('@hapi/hapi').ResponseToolkit} h
     */
    handler: async (request, h) => {
      const { organisationsRepository } = request
      const organisationId = request.params.organisationId
      const { status, reason, version } = request.payload
      const target = targetFor(type, request)

      const { organisation, previousStatus } =
        await organisationsRepository.appendStatusHistory(
          organisationId,
          version,
          target,
          status
        )

      await auditStatusTransition(request, {
        organisationId,
        target,
        previousStatus,
        nextStatus: status,
        reason
      })

      return h.response(organisation).code(StatusCodes.OK)
    }
  }
}

export const organisationStatusHistoryPost = makeRoute({
  type: 'organisation',
  path: '/v1/organisations/{organisationId}/status-history'
})

export const registrationStatusHistoryPost = makeRoute({
  type: 'registration',
  path: '/v1/organisations/{organisationId}/registrations/{registrationId}/status-history'
})

export const accreditationStatusHistoryPost = makeRoute({
  type: 'accreditation',
  path: '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/status-history'
})
