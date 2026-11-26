import { isOneOf } from '#common/helpers/is-one-of.js'
import {
  ORGANISATION_STATUSES,
  statusOn
} from '#organisation-read-model/domain/model.js'
import { toOrganisationStatusTimeline } from './to-status-timeline.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { StoredLinkedDefraOrganisation, Organisation as StoredOrganisation } from '#domain/organisations/model.js' */

/**
 * @param {Pick<StoredOrganisation, 'statusHistory'>} stored
 * @param {CalendarDate} date
 * @returns {boolean}
 */
export function servesOrganisationOn(stored, date) {
  return isOneOf(
    ORGANISATION_STATUSES,
    statusOn(toOrganisationStatusTimeline(stored.statusHistory).timeline, date)
  )
}

/**
 * @param {StoredLinkedDefraOrganisation} linked
 * @returns {NonNullable<Organisation['linkedDefraOrganisation']>}
 */
export function toLinkedDefraOrganisation(linked) {
  return {
    defraOrganisation: { id: linked.orgId, name: linked.orgName },
    linkedAt: new Date(linked.linkedAt).toISOString(),
    linkedBy: { email: linked.linkedBy.email, id: linked.linkedBy.id }
  }
}
