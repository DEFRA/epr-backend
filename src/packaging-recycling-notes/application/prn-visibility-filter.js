/**
 * Resolves test organisation numeric IDs to MongoDB _id hex strings
 * and combines with explicitly excluded PRN IDs to produce a
 * visibility filter for the external PRN API.
 *
 * @param {import('mongodb').Db} db
 * @param {{ testOrganisationIds: number[], excludePrnIds: string[] }} options
 * @returns {Promise<{ excludeOrganisationIds: string[], excludePrnIds: string[] }>}
 */
export async function createPrnVisibilityFilter(
  db,
  { testOrganisationIds, excludePrnIds = [] }
) {
  if (testOrganisationIds.length === 0) {
    return { excludeOrganisationIds: [], excludePrnIds }
  }

  const organisations = await db
    .collection('epr-organisations')
    .find({ orgId: { $in: testOrganisationIds } }, { projection: { _id: 1 } })
    .toArray()

  const excludeOrganisationIds = organisations.map((org) =>
    org._id.toHexString()
  )

  return { excludeOrganisationIds, excludePrnIds }
}
