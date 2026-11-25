import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import { HELD_ACCREDITATION_STATUSES } from './model.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationCommon, RegistrationStatus, Status, StatusTimeline } from './model.js' */

/**
 * Re-ex cancels a stored accreditation when its registration is cancelled.
 * An external accreditation is held read-only in the registration service, so
 * the same cancellation is applied as it is served. Once the registration is
 * reinstated, the registration service's own statuses stand again.
 *
 * @param {Record<Year, AccreditationCommon>} externalAccreditations
 * @param {Status<RegistrationStatus>} registrationStatus
 * @returns {Record<Year, AccreditationCommon>}
 */
export const withRegistrationCancellation = (
  externalAccreditations,
  registrationStatus
) => {
  if (registrationStatus.current !== REGISTRATION_STATUS.CANCELLED) {
    return externalAccreditations
  }
  const { at: cancelledAt } =
    /** @type {StatusTimeline<RegistrationStatus>[number]} */ (
      registrationStatus.timeline.findLast(
        ({ status }) => status === REGISTRATION_STATUS.CANCELLED
      )
    )
  return /** @type {Record<Year, AccreditationCommon>} */ (
    Object.fromEntries(
      Object.entries(externalAccreditations).flatMap(
        ([year, accreditation]) => {
          const cancelled = cancelledFrom(
            accreditation,
            cancelledAt,
            registrationStatus.lastUpdatedAt
          )
          return cancelled ? [[year, cancelled]] : []
        }
      )
    )
  )
}

/**
 * The accreditation as it stood when its registration was cancelled, and
 * cancelled from then if it was still held. What the registration service
 * records after the cancellation is left out. An accreditation that had not
 * started by then was never held, so there is none.
 *
 * @param {AccreditationCommon} accreditation
 * @param {string} cancelledAt
 * @param {string} cancellationRecordedAt
 * @returns {AccreditationCommon | null}
 */
const cancelledFrom = (accreditation, cancelledAt, cancellationRecordedAt) => {
  const timeline = accreditation.status.timeline.filter(
    ({ at }) => at.localeCompare(cancelledAt) <= 0
  )
  const statusWhenCancelled = timeline.at(-1)?.status
  if (statusWhenCancelled === undefined) {
    return null
  }
  if (!HELD_ACCREDITATION_STATUSES.has(statusWhenCancelled)) {
    return {
      ...accreditation,
      status: {
        ...accreditation.status,
        current: statusWhenCancelled,
        timeline
      }
    }
  }
  return {
    ...accreditation,
    status: {
      current: ACCREDITATION_STATUS.CANCELLED,
      lastUpdatedAt: cancellationRecordedAt,
      timeline: [
        ...timeline,
        { status: ACCREDITATION_STATUS.CANCELLED, at: cancelledAt }
      ]
    }
  }
}
