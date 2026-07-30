import {
  ACCREDITATION_STATUS,
  ACTIVE_ACCREDITATION_STATUSES,
  ORGANISATION_STATUS,
  REGISTRATION_STATUS
} from './model.js'
import { isOrgStatusTransitionValid } from './status.js'

/** @import {LinkedDefraOrganisation, Organisation, OrganisationUpdate} from './model.js' */
/** @import {Registration} from './registration.js' */
/** @import {Accreditation} from './accreditation.js' */

/**
 * @typedef {typeof LIFECYCLE_REFUSAL.INVALID_TRANSITION
 *   | typeof LIFECYCLE_REFUSAL.NO_APPROVED_REGISTRATION
 *   | typeof LIFECYCLE_REFUSAL.NOT_LINKED_TO_DEFRA_ORGANISATION} OrganisationStatusRefusal
 */

/**
 * A lifecycle decision as data: either the change stands, or a typed reason it
 * does not. The deciders never throw — each caller turns a refusal into the
 * error its own callers expect.
 *
 * The discriminant is `outcome` rather than `status`, which everything else in
 * this domain uses for an organisation, registration or accreditation status.
 *
 * @typedef {{ outcome: typeof LIFECYCLE_DECISION.ACCEPTED }
 *   | { outcome: typeof LIFECYCLE_DECISION.REFUSED, reason: OrganisationStatusRefusal }
 *   } OrganisationStatusDecision
 */

/**
 * @typedef {Organisation & { linkedDefraOrganisation: LinkedDefraOrganisation }} LinkedOrganisation
 */

/**
 * @typedef {{ outcome: typeof LIFECYCLE_DECISION.ACCEPTED, organisation: LinkedOrganisation }
 *   | { outcome: typeof LIFECYCLE_DECISION.REFUSED, reason: typeof LIFECYCLE_REFUSAL.NOT_LINKABLE }
 *   } OrganisationLinkDecision
 */

/**
 * @typedef {{
 *   organisation: Organisation,
 *   linkableOrganisations: Organisation[],
 *   defraOrganisation: Pick<LinkedDefraOrganisation, 'orgId' | 'orgName'>,
 *   linkedBy: LinkedDefraOrganisation['linkedBy'],
 *   linkedAt: string
 * }} OrganisationLinkRequest
 */

export const LIFECYCLE_DECISION = Object.freeze({
  ACCEPTED: 'accepted',
  REFUSED: 'refused'
})

export const LIFECYCLE_REFUSAL = Object.freeze({
  INVALID_TRANSITION: 'invalid-transition',
  NO_APPROVED_REGISTRATION: 'no-approved-registration',
  NOT_LINKED_TO_DEFRA_ORGANISATION: 'not-linked-to-defra-organisation',
  NOT_LINKABLE: 'not-linkable'
})

/** @type {{ outcome: typeof LIFECYCLE_DECISION.ACCEPTED }} */
const ACCEPTED = Object.freeze({ outcome: LIFECYCLE_DECISION.ACCEPTED })

/**
 * @param {OrganisationStatusRefusal} reason
 * @returns {OrganisationStatusDecision}
 */
const refused = (reason) => ({ outcome: LIFECYCLE_DECISION.REFUSED, reason })

/**
 * @param {OrganisationUpdate} organisation
 * @returns {boolean}
 */
const hasApprovedRegistration = (organisation) =>
  organisation.registrations.some(
    (registration) => registration.status === REGISTRATION_STATUS.APPROVED
  )

/**
 * @param {OrganisationUpdate} organisation
 * @returns {boolean}
 */
const isLinkedToDefraOrganisation = (organisation) =>
  !!organisation.linkedDefraOrganisation &&
  Object.keys(organisation.linkedDefraOrganisation).length > 0

/**
 * Decide whether an organisation may take the status its update requests. An
 * update that leaves the status alone is accepted untouched; a change must be
 * on the transition table and satisfy the conditions the target status carries.
 *
 * @param {Organisation} existing
 * @param {OrganisationUpdate} requested - the incoming update, whose
 *   registrations and linked Defra organisation the conditions are judged
 *   against.
 * @returns {OrganisationStatusDecision}
 */
export const decideOrganisationStatusChange = (existing, requested) => {
  if (!requested.status || existing.status === requested.status) {
    return ACCEPTED
  }

  if (!isOrgStatusTransitionValid(existing.status, requested.status)) {
    return refused(LIFECYCLE_REFUSAL.INVALID_TRANSITION)
  }

  if (
    requested.status === ORGANISATION_STATUS.APPROVED &&
    !hasApprovedRegistration(requested)
  ) {
    return refused(LIFECYCLE_REFUSAL.NO_APPROVED_REGISTRATION)
  }

  if (
    requested.status === ORGANISATION_STATUS.ACTIVE &&
    !isLinkedToDefraOrganisation(requested)
  ) {
    return refused(LIFECYCLE_REFUSAL.NOT_LINKED_TO_DEFRA_ORGANISATION)
  }

  return ACCEPTED
}

/**
 * Linking an organisation to a Defra organisation activates it. Only an
 * organisation the user may link can be linked; that set is resolved by the
 * caller, which also holds the clock the link is stamped with.
 *
 * @param {OrganisationLinkRequest} request
 * @returns {OrganisationLinkDecision}
 */
export const decideOrganisationLink = ({
  organisation,
  linkableOrganisations,
  defraOrganisation,
  linkedBy,
  linkedAt
}) => {
  const isLinkable = linkableOrganisations.some(
    (linkable) => linkable.id === organisation.id
  )

  if (!isLinkable) {
    return {
      outcome: LIFECYCLE_DECISION.REFUSED,
      reason: LIFECYCLE_REFUSAL.NOT_LINKABLE
    }
  }

  return {
    outcome: LIFECYCLE_DECISION.ACCEPTED,
    organisation: {
      ...organisation,
      status: ORGANISATION_STATUS.ACTIVE,
      linkedDefraOrganisation: { ...defraOrganisation, linkedBy, linkedAt }
    }
  }
}

/**
 * @param {Registration} registration
 * @returns {boolean}
 */
const isRegistrationCancelled = (registration) =>
  registration.status === REGISTRATION_STATUS.CANCELLED

/**
 * Cancelling a registration force-cancels its linked accreditation, whether
 * that accreditation is approved or suspended (PAE-1705 Scenario 5). An
 * accreditation that was never live (created or rejected) is left untouched.
 * The returned cascadeCancelledIds mark the force-cancelled accreditations as
 * system-driven changes, exempt from the accreditation transition table —
 * which deliberately has no direct approved -> cancelled arc for user-driven
 * updates (ADR 0042).
 * @param {Registration[]} registrations
 * @param {Accreditation[]} accreditations
 * @returns {{ accreditations: Accreditation[], cascadeCancelledIds: Set<string> }}
 */
export const applyRegistrationStatusToLinkedAccreditations = (
  registrations,
  accreditations
) => {
  /** @type {Set<string>} */
  const linkedToCancelledRegistration = new Set()

  for (const reg of registrations) {
    if (reg.accreditationId && isRegistrationCancelled(reg)) {
      linkedToCancelledRegistration.add(reg.accreditationId)
    }
  }

  /** @type {Set<string>} */
  const cascadeCancelledIds = new Set()

  const updatedAccreditations = accreditations.map((acc) => {
    // Liveness is judged on the incoming payload status, so an attempt to
    // reinstate a cascade-cancelled accreditation (payload approved, its
    // registration still cancelled) is caught here and held at cancelled.
    if (
      linkedToCancelledRegistration.has(acc.id) &&
      ACTIVE_ACCREDITATION_STATUSES.has(acc.status)
    ) {
      cascadeCancelledIds.add(acc.id)
      return /** @type {Accreditation} */ ({
        ...acc,
        status: ACCREDITATION_STATUS.CANCELLED
      })
    }
    return acc
  })

  return { accreditations: updatedAccreditations, cascadeCancelledIds }
}
