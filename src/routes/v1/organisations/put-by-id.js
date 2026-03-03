import { ROLES } from '#common/helpers/auth/constants.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/organisations.js'
import { detectAccreditationStatusChanges } from '#application/waste-balances/detect-accreditation-changes.js'
import { recalculateWasteBalancesForAccreditation } from '#application/waste-balances/recalculate-for-accreditation.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationReplacement} OrganisationReplacement */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */
/** @typedef {import('#repositories/waste-records/port.js').WasteRecordsRepository} WasteRecordsRepository */
/** @typedef {import('#repositories/waste-balances/port.js').WasteBalancesRepository} WasteBalancesRepository */

/**
 * @typedef {{version: number, updateFragment: object}} PutByIdPayload
 */

export const organisationsPutByIdPath = '/v1/organisations/{id}'

const validateMyPayload = (payload) => {
  if (typeof payload.version !== 'number') {
    throw Boom.badRequest('Payload must include a numeric version field')
  }

  if (
    typeof payload.updateFragment !== 'object' ||
    payload.updateFragment === null
  ) {
    throw Boom.badRequest('Payload must include an updateFragment object')
  }

  return payload
}

export const organisationsPutById = {
  method: 'PUT',
  path: organisationsPutByIdPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api', 'admin'],
    validate: {
      payload: validateMyPayload
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest<PutByIdPayload> & {
   *    organisationsRepository: OrganisationsRepository,
   *    systemLogsRepository: SystemLogsRepository,
   *    wasteRecordsRepository: WasteRecordsRepository,
   *    wasteBalancesRepository: WasteBalancesRepository,
   *    params: { id: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository
    } = request

    const id = request.params.id.trim()

    if (!id) {
      throw Boom.notFound('Organisation not found')
    }

    const { version, updateFragment } = request.payload

    const { version: _v, id: _, ...sanitisedFragment } = updateFragment

    /** @type {OrganisationReplacement} */
    const updates = sanitisedFragment

    try {
      const initial = await organisationsRepository.findById(id)
      await organisationsRepository.replace(id, version, updates)
      const updated = await organisationsRepository.findById(id, version + 1)
      await auditOrganisationUpdate(request, id, initial, updated)

      const accreditationChanges = detectAccreditationStatusChanges(
        initial,
        updated
      )

      for (const change of accreditationChanges) {
        try {
          await recalculateWasteBalancesForAccreditation({
            organisationId: id,
            accreditationId: change.accreditationId,
            dependencies: {
              organisationsRepository,
              wasteRecordsRepository,
              wasteBalancesRepository
            }
          })
        } catch (recalcError) {
          request.logger.error(
            {
              organisationId: id,
              accreditationId: change.accreditationId,
              previousStatus: change.previousStatus,
              currentStatus: change.currentStatus,
              error: recalcError
            },
            'Failed to recalculate waste balances after accreditation status change'
          )
          throw recalcError
        }
      }

      return h.response(updated).code(StatusCodes.OK)
    } catch (error) {
      throw Boom.boomify(error)
    }
  }
}
