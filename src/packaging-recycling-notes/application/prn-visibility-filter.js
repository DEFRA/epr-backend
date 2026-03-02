/** @import { Db } from 'mongodb' */
/** @import { Organisation } from '#domain/organisations/model.js' */

/**
 * Resolves test organisation numeric IDs to MongoDB _id hex strings
 * for filtering test org PRNs from the external API.
 *
 * @param {Db} db
 * @param {{ testOrganisationIds: Organisation['orgId'][] }} options
 * @returns {Promise<{ excludeOrganisationIds: Organisation['id'][] }>}
 */
export async function createPrnVisibilityFilter(db, { testOrganisationIds }) {
  if (testOrganisationIds.length === 0) {
    return { excludeOrganisationIds: [] }
  }

  const organisations = await db
    .collection('epr-organisations')
    .find({ orgId: { $in: testOrganisationIds } }, { projection: { _id: 1 } })
    .toArray()

  const excludeOrganisationIds = organisations.map((org) =>
    org._id.toHexString()
  )

  return { excludeOrganisationIds }
}
