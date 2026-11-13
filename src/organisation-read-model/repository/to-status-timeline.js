import { isOneOf } from '#common/helpers/is-one-of.js'
import {
  ACCREDITATION_STATUSES,
  ORGANISATION_STATUSES,
  REGISTRATION_STATUSES
} from '#organisation-read-model/domain/model.js'

/** @import { StatusHistoryEntryOf } from '#domain/organisations/accreditation.js' */
/** @import { StoredAccreditationStatus, StoredOrganisationStatus, StoredRegistrationStatus } from '#domain/organisations/model.js' */
/** @import { AccreditationStatus, OrganisationStatus, RegistrationStatus, Status } from '#organisation-read-model/domain/model.js' */

/**
 * @template {string} T
 * @typedef {{ status: T, at: Date, updatedAt: string }} Change
 */

/**
 * The stored changes in the order they were recorded, each taking effect when
 * it was recorded.
 *
 * @template {string} T
 * @param {StatusHistoryEntryOf<T>[]} statusHistory
 * @returns {Change<T>[]}
 */
const inRecordedOrder = (statusHistory) =>
  statusHistory
    .map(({ status, updatedAt }) => ({
      status,
      at: new Date(updatedAt),
      updatedAt: new Date(updatedAt).toISOString()
    }))
    .toSorted((one, other) => one.at.getTime() - other.at.getTime())

/**
 * The changes after the last `created`: a record sent back to draft starts
 * again, so what it held before then no longer applies.
 *
 * @template {string} T
 * @param {Change<T>[]} recorded - in recorded order
 * @returns {Change<T>[]}
 */
const sinceLastCreated = (recorded) =>
  recorded.slice(
    recorded.findLastIndex(({ status }) => status === 'created') + 1
  )

/**
 * The changes to a status the read model serves, oldest first. Until
 * ADR-0051's events exist, the approval takes effect from validFrom and every
 * other change when it was recorded. A stable sort keeps recorded order among
 * equal times.
 *
 * @template {string} T
 * @template {T} S
 * @param {Change<T>[]} recorded - in recorded order
 * @param {string} validFrom
 * @param {readonly S[]} statuses - the statuses the read model serves
 * @returns {Change<S>[]}
 */
const setAtDates = (recorded, validFrom, statuses) => {
  const approval = recorded.findIndex(({ status }) => status === 'approved')
  const approvedFrom = new Date(validFrom)
  return recorded
    .map((change, index) =>
      index === approval ? { ...change, at: approvedFrom } : change
    )
    .toSorted((one, other) => one.at.getTime() - other.at.getTime())
    .flatMap(({ status, at, updatedAt }) =>
      isOneOf(statuses, status) ? [{ status, at, updatedAt }] : []
    )
}

/**
 * The timeline of the changes, and when the last of them was recorded.
 *
 * @template {string} S
 * @param {Change<S>[]} changes - oldest first
 * @returns {Omit<Status<S>, 'current'>}
 */
const toTimelineStatus = (changes) => ({
  lastUpdatedAt: changes.at(-1)?.updatedAt,
  timeline: changes.map(({ status, at }) => ({
    status,
    at: at.toISOString()
  }))
})

/**
 * Every change to an organisation, each when it was recorded, oldest first.
 *
 * @param {StatusHistoryEntryOf<StoredOrganisationStatus>[]} statusHistory
 * @returns {Omit<Status<OrganisationStatus>, 'current'>}
 */
export const toOrganisationStatusTimeline = (statusHistory) =>
  toTimelineStatus(
    inRecordedOrder(statusHistory).filter(({ status }) =>
      isOneOf(ORGANISATION_STATUSES, status)
    )
  )

/**
 * The registration's changes since it was last created, its approval taking
 * effect from validFrom.
 *
 * @param {StatusHistoryEntryOf<StoredRegistrationStatus>[]} statusHistory
 * @param {string} validFrom
 * @returns {Omit<Status<RegistrationStatus>, 'current'>}
 */
export const toRegistrationStatusTimeline = (statusHistory, validFrom) =>
  toTimelineStatus(
    setAtDates(
      sinceLastCreated(inRecordedOrder(statusHistory)),
      validFrom,
      REGISTRATION_STATUSES
    )
  )

/**
 * The accreditation's changes since it was last created, its approval taking
 * effect from validFrom.
 *
 * @param {StatusHistoryEntryOf<StoredAccreditationStatus>[]} statusHistory
 * @param {string} validFrom
 * @returns {Omit<Status<AccreditationStatus>, 'current'>}
 */
export const toAccreditationStatusTimeline = (statusHistory, validFrom) =>
  toTimelineStatus(
    setAtDates(
      sinceLastCreated(inRecordedOrder(statusHistory)),
      validFrom,
      ACCREDITATION_STATUSES
    )
  )
