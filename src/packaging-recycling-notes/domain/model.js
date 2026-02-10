export const PRN_NUMBER_MAX_LENGTH = 20

/**
 * Status values for Packaging Recycling Notes (PRNs)
 * @typedef {typeof PRN_STATUS[keyof typeof PRN_STATUS]} PrnStatus
 */
export const PRN_STATUS = Object.freeze({
  DRAFT: 'draft',
  AWAITING_AUTHORISATION: 'awaiting_authorisation',
  AWAITING_ACCEPTANCE: 'awaiting_acceptance',
  ACCEPTED: 'accepted',
  AWAITING_CANCELLATION: 'awaiting_cancellation',
  CANCELLED: 'cancelled',
  DELETED: 'deleted',
  DISCARDED: 'discarded'
})

/**
 * Actor types that can trigger PRN status transitions
 * @typedef {typeof PRN_ACTOR[keyof typeof PRN_ACTOR]} PrnActor
 */
export const PRN_ACTOR = Object.freeze({
  REPROCESSOR_EXPORTER: 'reprocessor_exporter',
  SIGNATORY: 'signatory',
  PRODUCER: 'producer'
})

/**
 * @typedef {{ status: PrnStatus; actors: PrnActor[] }} PrnTransition
 */

/**
 * Actor-aware status transitions for PRNs.
 * Each transition specifies which actor types are permitted to trigger it.
 * @type {Record<PrnStatus, PrnTransition[]>}
 */
export const PRN_STATUS_TRANSITIONS = Object.freeze({
  [PRN_STATUS.DRAFT]: [
    {
      status: PRN_STATUS.AWAITING_AUTHORISATION,
      actors: [PRN_ACTOR.REPROCESSOR_EXPORTER]
    },
    { status: PRN_STATUS.DISCARDED, actors: [PRN_ACTOR.REPROCESSOR_EXPORTER] }
  ],
  [PRN_STATUS.AWAITING_AUTHORISATION]: [
    { status: PRN_STATUS.AWAITING_ACCEPTANCE, actors: [PRN_ACTOR.SIGNATORY] },
    { status: PRN_STATUS.DELETED, actors: [PRN_ACTOR.SIGNATORY] }
  ],
  [PRN_STATUS.AWAITING_ACCEPTANCE]: [
    { status: PRN_STATUS.ACCEPTED, actors: [PRN_ACTOR.PRODUCER] },
    { status: PRN_STATUS.AWAITING_CANCELLATION, actors: [PRN_ACTOR.PRODUCER] }
  ],
  [PRN_STATUS.ACCEPTED]: [],
  [PRN_STATUS.AWAITING_CANCELLATION]: [
    { status: PRN_STATUS.CANCELLED, actors: [PRN_ACTOR.SIGNATORY] }
  ],
  [PRN_STATUS.CANCELLED]: [],
  [PRN_STATUS.DELETED]: [],
  [PRN_STATUS.DISCARDED]: []
})

/**
 * Checks whether a status transition is valid for a given actor.
 * @param {PrnStatus} currentStatus
 * @param {PrnStatus} newStatus
 * @param {PrnActor} actor
 * @returns {boolean}
 */
export function isValidTransition(currentStatus, newStatus, actor) {
  const transitions = PRN_STATUS_TRANSITIONS[currentStatus]
  if (!transitions) return false
  return transitions.some(
    (t) => t.status === newStatus && t.actors.includes(actor)
  )
}

export class StatusConflictError extends Error {
  constructor(currentStatus, newStatus) {
    super(`No transition exists from ${currentStatus} to ${newStatus}`)
    this.currentStatus = currentStatus
    this.newStatus = newStatus
  }
}

export class UnauthorisedTransitionError extends Error {
  constructor(currentStatus, newStatus, actor) {
    super(
      `Actor ${actor} is not permitted to transition from ${currentStatus} to ${newStatus}`
    )
    this.currentStatus = currentStatus
    this.newStatus = newStatus
    this.actor = actor
  }
}

/**
 * Validates a status transition, throwing a descriptive error on failure.
 * @param {PrnStatus} currentStatus
 * @param {PrnStatus} newStatus
 * @param {PrnActor} actor
 * @throws {StatusConflictError} when no transition from currentStatus to newStatus exists
 * @throws {UnauthorisedTransitionError} when the transition exists but the actor is not permitted
 */
export function validateTransition(currentStatus, newStatus, actor) {
  const transitions = PRN_STATUS_TRANSITIONS[currentStatus] ?? []
  const transitionExists = transitions.some((t) => t.status === newStatus)

  if (!transitionExists) {
    throw new StatusConflictError(currentStatus, newStatus)
  }

  const actorPermitted = transitions.some(
    (t) => t.status === newStatus && t.actors.includes(actor)
  )

  if (!actorPermitted) {
    throw new UnauthorisedTransitionError(currentStatus, newStatus, actor)
  }
}

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   tradingName?: string;
 * }} OrganisationNameAndId
 */

/**
 * @typedef {{
 *   id: string;
 *   accreditationNumber: string;
 *   accreditationYear: number;
 *   material: string;
 *   submittedToRegulator: string;
 *   glassRecyclingProcess?: string;
 *   siteAddress?: {
 *     line1: string;
 *     line2?: string;
 *     town?: string;
 *     county?: string;
 *     postcode: string;
 *     country?: string;
 *   };
 * }} AccreditationSnapshot
 */

/**
 * @typedef {{
 *   status: PrnStatus;
 *   updatedAt: Date;
 *   updatedBy: { id: string; name: string };
 * }} PrnStatusHistoryItem
 */

/**
 * @typedef {{
 *   id: string;
 *   schemaVersion: number;
 *   prnNumber?: string | null;
 *   organisation: OrganisationNameAndId;
 *   registrationId: string;
 *   accreditation: AccreditationSnapshot;
 *   issuedToOrganisation: OrganisationNameAndId;
 *   tonnage: number;
 *   isExport: boolean;
 *   notes?: string;
 *   isDecemberWaste: boolean;
 *   issuedAt: Date | null;
 *   issuedBy: { id: string; name: string; position: string } | null;
 *   status: {
 *     currentStatus: PrnStatus;
 *     history: PrnStatusHistoryItem[];
 *   };
 *   createdAt: Date;
 *   createdBy: { id: string; name: string };
 *   updatedAt: Date;
 *   updatedBy: { id: string; name: string } | null;
 * }} PackagingRecyclingNote
 */

/**
 * @typedef {{
 *   id: string;
 *   accreditationYear: number | null;
 *   createdAt: Date;
 *   isDecemberWaste: boolean;
 *   issuedToOrganisation: OrganisationNameAndId;
 *   material: string;
 *   notes: string | null;
 *   processToBeUsed: string;
 *   status: PrnStatus;
 *   tonnage: number;
 *   wasteProcessingType: string;
 * }} CreatePrnResponse
 */

/**
 * @typedef {CreatePrnResponse & {
 *   issuedAt: Date | null;
 *   issuedBy: { id: string; name: string; position: string } | null;
 *   prnNumber: string | null;
 * }} GetPrnResponse
 */
