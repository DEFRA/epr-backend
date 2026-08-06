import { SCOPES } from '#common/helpers/auth/constants.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/organisations.js'
import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import {
  isAccreditationStatusTransitionValid,
  isRegistrationStatusTransitionValid
} from '#domain/organisations/status.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { StatusTransitionPredicate } from '#domain/organisations/status.js' */

/**
 * @typedef {{status: string, updatedAt: Date | string, updatedBy?: string}} StatusHistoryEntry
 */

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

export const validateMyPayload = (payload) => {
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

/**
 * Incoming dates arrive as ISO strings from the editor round-trip while stored
 * ones are Dates, so entries are only ever compared by timestamp.
 * @param {Date | string} updatedAt
 * @returns {number}
 */
const toTimestamp = (updatedAt) => new Date(updatedAt).getTime()

/**
 * @param {StatusHistoryEntry} incoming
 * @param {StatusHistoryEntry} stored
 * @returns {boolean}
 */
const isSameEntry = (incoming, stored) =>
  incoming.status === stored.status &&
  incoming.updatedBy === stored.updatedBy &&
  toTimestamp(incoming.updatedAt) === toTimestamp(stored.updatedAt)

/**
 * @param {StatusHistoryEntry[]} incoming
 * @param {StatusHistoryEntry[]} stored
 * @returns {boolean}
 */
const isUnchangedHistory = (incoming, stored) =>
  incoming.length === stored.length &&
  incoming.every((entry, index) => isSameEntry(entry, stored[index]))

/**
 * @param {StatusHistoryEntry[]} incoming
 * @param {StatusHistoryEntry[]} stored - same length as incoming (checked first)
 * @returns {boolean}
 */
const hasSameUpdatedBy = (incoming, stored) =>
  incoming.every((entry, index) => entry.updatedBy === stored[index].updatedBy)

/**
 * @param {StatusHistoryEntry[]} history
 * @returns {boolean}
 */
const isStrictlyAscending = (history) =>
  history.every(
    (entry, index) =>
      index === 0 ||
      toTimestamp(history[index - 1].updatedAt) < toTimestamp(entry.updatedAt)
  )

/**
 * @param {StatusHistoryEntry[]} history
 * @param {StatusTransitionPredicate} isValidTransition
 * @returns {{from: string, to: string} | null} the first adjacent pair the transition table rejects
 */
const findInvalidTransition = (history, isValidTransition) => {
  for (let index = 1; index < history.length; index++) {
    const from = history[index - 1].status
    const to = history[index].status
    // A repeated status is not a transition — the domain skips validation for
    // same-status updates, and correcting an entry to match its neighbour
    // (e.g. neutralising a wrongly recorded suspension) must be allowed.
    if (from !== to && !isValidTransition(from, to)) {
      return { from, to }
    }
  }
  return null
}

/**
 * Cancelling a registration force-cancels its linked accreditation, an edge the
 * accreditation transition table deliberately omits for user-driven changes.
 * Such a history is stored data an admin must still be able to redate.
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
const isValidAccreditationHistoryTransition = (fromStatus, toStatus) =>
  isAccreditationStatusTransitionValid(fromStatus, toStatus) ||
  (fromStatus === ACCREDITATION_STATUS.APPROVED &&
    toStatus === ACCREDITATION_STATUS.CANCELLED)

/**
 * @param {string} label - 'Registration' or 'Accreditation', used in error messages
 * @param {string | undefined} id
 * @param {StatusHistoryEntry[]} incoming
 * @param {StatusHistoryEntry[]} stored
 * @param {StatusTransitionPredicate} isValidTransition
 * @returns {string | null} the clause for the first rule the edit breaks, or null when it is allowed
 */
const findStatusHistoryViolation = (
  label,
  id,
  incoming,
  stored,
  isValidTransition
) => {
  // An unchanged echo skips every check. The editor round-trips the whole
  // document, so an organisation whose stored history already breaks the rules
  // would otherwise 422 on every save, including edits to unrelated fields.
  if (isUnchangedHistory(incoming, stored)) {
    return null
  }

  if (incoming.length !== stored.length) {
    return `${label} ${id} status history entries cannot be added or removed`
  }

  if (!hasSameUpdatedBy(incoming, stored)) {
    return `${label} ${id} status history updatedBy cannot be changed`
  }

  if (incoming[0].status !== REGISTRATION_STATUS.CREATED) {
    return `${label} ${id} status history must start with created`
  }

  if (!isStrictlyAscending(incoming)) {
    return `${label} ${id} status history dates must be in date order`
  }

  const invalidTransition = findInvalidTransition(incoming, isValidTransition)
  if (invalidTransition) {
    return `${label} ${id} status history contains an invalid transition from ${invalidTransition.from} to ${invalidTransition.to}`
  }

  return null
}

/**
 * @param {string} label - 'Registration' or 'Accreditation', used in error messages
 * @param {Array<{id: string, statusHistory: StatusHistoryEntry[]}>} existingItems - items from the stored document
 * @param {Array<{id?: string, statusHistory?: StatusHistoryEntry[]}> | undefined} itemUpdates - items from the incoming update fragment
 * @param {StatusTransitionPredicate} isValidTransition
 * @returns {string[]} one error clause per offending item
 */
const collectStatusHistoryErrors = (
  label,
  existingItems,
  itemUpdates,
  isValidTransition
) => {
  /** @type {Map<string | undefined, {id: string, statusHistory: StatusHistoryEntry[]}>} */
  const existingById = new Map(existingItems.map((item) => [item.id, item]))

  const errors = []
  for (const item of itemUpdates ?? []) {
    if (!item.statusHistory) {
      continue
    }

    const existing = existingById.get(item.id)
    const violation = existing
      ? findStatusHistoryViolation(
          label,
          item.id,
          item.statusHistory,
          existing.statusHistory,
          isValidTransition
        )
      : `${label} ${item.id} status history cannot be set on new items`

    if (violation) {
      errors.push(violation)
    }
  }
  return errors
}

/**
 * A registration or accreditation status history may have its entry statuses
 * and updatedAt dates corrected through this endpoint (PAE-1809). Entries
 * cannot be added, removed or reattributed, the history must still start at
 * created, corrected dates must stay strictly ascending, and the resulting
 * sequence must be a walk of the domain transition table. Correcting the last
 * entry changes the item's derived status directly — deliberately, per the
 * ticket — without the dedicated transition endpoints' side effects (no
 * cascade cancel, no grant fields, no approval-uniqueness check).
 *
 * @param {Organisation} initial - the stored organisation (findById throws 404 when the id is unknown)
 * @param {OrganisationReplacement} updates
 * @throws {Boom.Boom} 422 with one clause per offending item, joined by '; '
 */
const validateStatusHistoryEdits = (initial, updates) => {
  const errors = [
    ...collectStatusHistoryErrors(
      'Registration',
      initial.registrations,
      updates.registrations,
      isRegistrationStatusTransitionValid
    ),
    ...collectStatusHistoryErrors(
      'Accreditation',
      initial.accreditations,
      updates.accreditations,
      isValidAccreditationHistoryTransition
    )
  ]

  if (errors.length > 0) {
    throw Boom.badData(errors.join('; '))
  }
}

/**
 * Builds the PUT handler. The public route enforces the status immutability
 * and status-history guards and audits the change; the non-prod dev seeding
 * route (`/v1/dev/organisations/{id}`) skips them all — journey-test fixtures
 * use it to seed statuses, numbers and status histories directly, and it is
 * unauthenticated so there is no actor to audit.
 * @param {{ devSeeding?: boolean }} [options]
 */
export const makePutOrganisationHandler =
  ({ devSeeding = false } = {}) =>
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<PutByIdPayload> & {
   *    organisationsRepository: OrganisationsRepository,
   *    overseasSitesRepository: OverseasSitesRepository,
   *    systemLogsRepository: SystemLogsRepository,
   *    params: { id: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  async (request, h) => {
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
    if (!devSeeding) {
      validateStatusesUnchanged(initial, updates)
      validateStatusHistoryEdits(initial, updates)
    }

    await validateOverseasSiteReferences(
      overseasSitesRepository,
      updates.registrations
    )

    await organisationsRepository.replace(id, version, updates)
    const updated = await organisationsRepository.findById(id, version + 1)
    if (!devSeeding) {
      await auditOrganisationUpdate(request, id, initial, updated)
    }
    return h.response(updated).code(StatusCodes.OK)
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

  handler: makePutOrganisationHandler()
}
