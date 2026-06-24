import Boom from '@hapi/boom'
import {
  assertOrgStatusTransitionValid,
  assertRegAccStatusTransitionValid
} from '#domain/organisations/status.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import {
  applyRegistrationStatusToLinkedAccreditations,
  requireApprovedRegistration
} from './schema/status-transition.js'
import {
  validateApprovals,
  validateAccreditationLinkUniqueness,
  validateAccreditationLinkExists,
  validateAccreditationLinkMatches
} from './schema/helpers.js'
import { createStatusHistoryEntry } from './helpers.js'

/** @import {StatusTransitionTarget} from './port.js' */

/**
 * Validate a single status transition and produce the statusHistory entries to
 * append. Pure — no DB access. Throws Boom on any invalid transition/guard.
 *
 * @param {import('#domain/organisations/model.js').Organisation} existing
 *   organisation in derived-status shape (items carry `.status`)
 * @param {StatusTransitionTarget} target
 * @param {string} toStatus
 * @returns {import('./port.js').StatusHistoryAppendResult}
 */
export const prepareStatusHistoryAppend = (existing, target, toStatus) => {
  if (target.type === 'organisation') {
    return prepareOrganisation(existing, toStatus)
  }
  if (target.type === 'registration') {
    return prepareRegistration(existing, target.registrationId, toStatus)
  }
  return prepareAccreditation(
    existing,
    target.registrationId,
    target.accreditationId,
    toStatus
  )
}

/** @returns {import('./port.js').StatusHistoryAppendResult} */
const prepareOrganisation = (existing, toStatus) => {
  if (toStatus === ORGANISATION_STATUS.ACTIVE) {
    throw Boom.badData(
      'Cannot transition organisation to active: activation is owned by the Defra ID link flow'
    )
  }
  const previousStatus = existing.status
  assertOrgStatusTransitionValid(previousStatus, toStatus)

  if (toStatus === ORGANISATION_STATUS.APPROVED) {
    requireApprovedRegistration(existing)
  }

  return {
    previousStatus,
    changes: [
      {
        itemType: 'organisation',
        entry: createStatusHistoryEntry(toStatus)
      }
    ]
  }
}

/** @returns {import('./port.js').StatusHistoryAppendResult} */
const prepareRegistration = (existing, registrationId, toStatus) => {
  const registration = existing.registrations.find(
    (r) => r.id === registrationId
  )
  if (!registration) {
    throw Boom.notFound(`Registration ${registrationId} not found`)
  }
  const previousStatus = registration.status
  assertRegAccStatusTransitionValid(previousStatus, toStatus)

  // Project the post-change state and run cross-item approval checks.
  const projectedRegistrations = existing.registrations.map((r) =>
    r.id === registrationId ? { ...r, status: toStatus } : r
  )
  const projectedAccreditations = applyRegistrationStatusToLinkedAccreditations(
    projectedRegistrations,
    existing.accreditations
  )
  validateApprovals(projectedRegistrations, projectedAccreditations)

  /** @type {import('./port.js').StatusHistoryChange[]} */
  const changes = [
    {
      itemType: 'registration',
      id: registrationId,
      entry: createStatusHistoryEntry(toStatus)
    }
  ]

  // Cascade: linked accreditation acquires the same status on suspend/cancel.
  // Every projected accreditation maps from existing.accreditations, so its id
  // is always present here.
  for (const accreditation of projectedAccreditations) {
    const before = existing.accreditations.find(
      (a) => a.id === accreditation.id
    )
    if (before.status !== accreditation.status) {
      changes.push({
        itemType: 'accreditation',
        id: accreditation.id,
        entry: createStatusHistoryEntry(accreditation.status)
      })
    }
  }

  return { previousStatus, changes }
}

/** @returns {import('./port.js').StatusHistoryAppendResult} */
const prepareAccreditation = (
  existing,
  registrationId,
  accreditationId,
  toStatus
) => {
  const registration = existing.registrations.find(
    (r) => r.id === registrationId
  )
  if (!registration) {
    throw Boom.notFound(`Registration ${registrationId} not found`)
  }
  if (registration.accreditationId !== accreditationId) {
    throw Boom.notFound(
      `Accreditation ${accreditationId} is not linked to registration ${registrationId}`
    )
  }

  // The registration -> accreditation link is load-bearing (it drives the
  // cascade), so enforce its integrity at the write boundary with the same
  // predicates the validation sweep uses, rather than trusting the path params.
  validateAccreditationLinkUniqueness(existing.registrations)
  validateAccreditationLinkExists([registration], existing.accreditations)
  validateAccreditationLinkMatches([registration], existing.accreditations)

  const accreditation = /** @type {{ status: string }} */ (
    existing.accreditations.find((a) => a.id === accreditationId)
  )
  const previousStatus = accreditation.status
  assertRegAccStatusTransitionValid(previousStatus, toStatus)

  const projectedAccreditations = existing.accreditations.map((a) =>
    a.id === accreditationId ? { ...a, status: toStatus } : a
  )
  validateApprovals(existing.registrations, projectedAccreditations)

  return {
    previousStatus,
    changes: [
      {
        itemType: 'accreditation',
        id: accreditationId,
        entry: createStatusHistoryEntry(toStatus)
      }
    ]
  }
}
