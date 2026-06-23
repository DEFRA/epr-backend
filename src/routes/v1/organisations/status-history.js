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
/** @typedef {import('#domain/organisations/model.js').Organisation} Organisation */

const ALL_STATUSES = [
  ...new Set([
    ...Object.values(REG_ACC_STATUS),
    ...Object.values(ORGANISATION_STATUS)
  ])
]

const payloadSchema = Joi.object({
  status: Joi.string()
    .valid(...ALL_STATUSES)
    .required(),
  reason: Joi.string().trim().min(1).required(),
  version: Joi.number().integer().required()
})

/**
 * Function validator (the convention in this codebase — the server has no Hapi
 * Joi validator registered). Validates the payload with the Joi schema and
 * raises a 400 on any violation.
 *
 * @param {unknown} value
 * @returns {{ status: string, reason: string, version: number }}
 */
const validatePayload = (value) => {
  const { error, value: validated } = payloadSchema.validate(value)
  if (error) {
    throw Boom.badRequest(error.message)
  }
  return validated
}

/**
 * Build the status-transition target from the route type and path params.
 *
 * @param {'organisation'|'registration'|'accreditation'} type
 * @param {{ params: { registrationId?: string, accreditationId?: string } }} request
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
    accreditationId: request.params.accreditationId
  }
}

/**
 * Read the current status of the targeted item from an organisation. Only
 * called after the transition has been validated, so the target always exists.
 *
 * @param {Organisation} organisation
 * @param {StatusTransitionTarget} target
 * @returns {string}
 */
const statusOfTarget = (organisation, target) => {
  if (target.type === 'organisation') {
    return organisation.status
  }
  if (target.type === 'registration') {
    return organisation.registrations.find(
      (registration) => registration.id === target.registrationId
    ).status
  }
  return organisation.accreditations.find(
    (accreditation) => accreditation.id === target.accreditationId
  ).status
}

/**
 * @param {{ type: 'organisation'|'registration'|'accreditation', path: string }} config
 * @returns {import('@hapi/hapi').ServerRoute}
 */
const makeRoute = ({ type, path }) => ({
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
    const updatedBy = request.auth.credentials.id

    // Capture the pre-change state so the audit records the true previous
    // status; appendStatusHistory validates existence/transition next, so the
    // target is guaranteed to exist by the time we read it for the audit.
    const before = await organisationsRepository.findById(organisationId)
    const updated = await organisationsRepository.appendStatusHistory(
      organisationId,
      version,
      target,
      status,
      updatedBy
    )

    await auditStatusTransition(request, {
      organisationId,
      target,
      previousStatus: statusOfTarget(before, target),
      nextStatus: status,
      reason
    })

    return h.response(updated).code(StatusCodes.OK)
  }
})

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
