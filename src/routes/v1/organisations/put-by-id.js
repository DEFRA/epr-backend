import { SCOPES } from '#common/helpers/auth/constants.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/organisations.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationReplacement} OrganisationReplacement */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */
/** @typedef {import('#overseas-sites/repository/port.js').OverseasSitesRepository} OverseasSitesRepository */

/**
 * @typedef {{version: number, updateFragment: Partial<Organisation>}} PutByIdPayload
 */

export const organisationsPutByIdPath = '/v1/organisations/{id}'

/**
 * @param {OverseasSitesRepository} overseasSitesRepository
 * @param {Array<{overseasSites?: Record<string, {overseasSiteId: string}>}> | undefined} registrations
 */
async function validateOverseasSiteReferences(
  overseasSitesRepository,
  registrations
) {
  const allSiteIds = new Set()

  for (const reg of registrations ?? []) {
    for (const entry of Object.values(reg.overseasSites ?? {})) {
      allSiteIds.add(entry.overseasSiteId)
    }
  }

  if (allSiteIds.size === 0) {
    return
  }

  const missingIds = []
  for (const siteId of allSiteIds) {
    const site = await overseasSitesRepository.findById(siteId)
    if (!site) {
      missingIds.push(siteId)
    }
  }

  if (missingIds.length > 0) {
    throw Boom.badData(`Overseas site(s) not found: ${missingIds.join(', ')}`)
  }
}

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

/**
 * @param {string} label - 'Registration' or 'Accreditation', used in error messages
 * @param {Array<{id: string, status?: string}>} existingItems - items from the stored document, with derived status
 * @param {Array<{id?: string, status?: string}> | undefined} itemUpdates - items from the incoming update fragment
 * @returns {string[]} one error clause per offending item
 */
const collectStatusChangeErrors = (label, existingItems, itemUpdates) => {
  /** @type {Map<string | undefined, {id: string, status?: string}>} */
  const existingById = new Map(existingItems.map((item) => [item.id, item]))

  const errors = []
  for (const item of itemUpdates ?? []) {
    const existing = existingById.get(item.id)
    if (existing && item.status && item.status !== existing.status) {
      errors.push(
        `${label} ${item.id} status cannot be changed from ${existing.status} to ${item.status} here — use the status transition actions`
      )
    }
    if (!existing && item.status && item.status !== 'created') {
      errors.push(
        `${label} ${item.id} status cannot be set to ${item.status} here — new items start as created`
      )
    }
  }
  return errors
}

/**
 * Registration and accreditation statuses cannot be changed via this endpoint;
 * status changes go through the dedicated status-history endpoints (PAE-1645).
 *
 * @param {Organisation} initial - the stored organisation (findById throws 404 when the id is unknown)
 * @param {OrganisationReplacement} updates
 * @throws {Boom.Boom} 422 with one clause per offending item, joined by '; '
 */
const validateStatusesUnchanged = (initial, updates) => {
  const errors = [
    ...collectStatusChangeErrors(
      'Registration',
      initial.registrations,
      updates.registrations
    ),
    ...collectStatusChangeErrors(
      'Accreditation',
      initial.accreditations,
      updates.accreditations
    )
  ]

  if (errors.length > 0) {
    throw Boom.badData(errors.join('; '))
  }
}

export const organisationsPutById = {
  method: 'PUT',
  path: organisationsPutByIdPath,
  options: {
    auth: {
      scope: [SCOPES.adminWrite]
    },
    tags: ['api', 'admin'],
    validate: {
      payload: validateMyPayload
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest<PutByIdPayload> & {
   *    organisationsRepository: OrganisationsRepository,
   *    overseasSitesRepository: OverseasSitesRepository,
   *    systemLogsRepository: SystemLogsRepository,
   *    params: { id: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository, overseasSitesRepository } = request

    const id = request.params.id.trim()

    if (!id) {
      throw Boom.notFound('Organisation not found')
    }

    const { version, updateFragment } = request.payload

    const { version: _v, id: _, ...sanitisedFragment } = updateFragment

    /** @type {OrganisationReplacement} */
    const updates = sanitisedFragment

    const initial = await organisationsRepository.findById(id)
    validateStatusesUnchanged(initial, updates)

    await validateOverseasSiteReferences(
      overseasSitesRepository,
      updates.registrations
    )

    await organisationsRepository.replace(id, version, updates)
    const updated = await organisationsRepository.findById(id, version + 1)
    await auditOrganisationUpdate(request, id, initial, updated)
    return h.response(updated).code(StatusCodes.OK)
  }
}
