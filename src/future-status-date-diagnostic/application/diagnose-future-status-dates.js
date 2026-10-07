import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

/**
 * @typedef {'organisation' | 'registration' | 'accreditation'} ItemType
 */

/**
 * @typedef {Object} FutureStatusDateRow
 * @property {string} organisationId
 * @property {number} orgId
 * @property {boolean} testOrganisation
 * @property {ItemType} itemType
 * @property {string} itemId
 * @property {string} status
 * @property {string} updatedAt - ISO 8601
 */

/**
 * @typedef {Object} FutureStatusDatesSummary
 * @property {number} scannedOrganisations
 * @property {number} scannedEntries
 * @property {number} futureDatedEntries
 */

/**
 * @typedef {Object} FutureStatusDatesReport
 * @property {FutureStatusDateRow[]} rows
 * @property {FutureStatusDatesSummary} summary
 */

/**
 * @param {Organisation} organisation
 * @returns {{ itemType: ItemType, itemId: string, statusHistory: { status: string, updatedAt: Date | string }[] }[]}
 */
const itemsOf = (organisation) => [
  {
    itemType: 'organisation',
    itemId: organisation.id,
    statusHistory: organisation.statusHistory
  },
  ...organisation.registrations.map(({ id, statusHistory }) => ({
    itemType: /** @type {const} */ ('registration'),
    itemId: id,
    statusHistory
  })),
  ...organisation.accreditations.map(({ id, statusHistory }) => ({
    itemType: /** @type {const} */ ('accreditation'),
    itemId: id,
    statusHistory
  }))
]

/**
 * Lists every status history entry dated after `now`.
 *
 * @param {Organisation[]} organisations
 * @param {Date} now
 * @returns {FutureStatusDatesReport}
 */
export const diagnoseFutureStatusDates = (organisations, now) => {
  const entries = organisations.flatMap((organisation) =>
    itemsOf(organisation).flatMap(({ itemType, itemId, statusHistory }) =>
      statusHistory.map(({ status, updatedAt }) => ({
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: TEST_ORGANISATION_IDS.has(organisation.orgId),
        itemType,
        itemId,
        status,
        updatedAt: new Date(updatedAt).toISOString()
      }))
    )
  )
  const rows = entries.filter(
    ({ updatedAt }) => new Date(updatedAt).getTime() > now.getTime()
  )

  return {
    rows,
    summary: {
      scannedOrganisations: organisations.length,
      scannedEntries: entries.length,
      futureDatedEntries: rows.length
    }
  }
}
