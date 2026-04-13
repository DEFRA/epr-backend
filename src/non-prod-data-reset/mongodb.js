import { ObjectId } from 'mongodb'

/** @import { Db } from 'mongodb' */

/**
 * @typedef {{
 *   deleteByOrgId: (orgId: string) => Promise<Record<string, number>>
 * }} NonProdDataReset
 */

const COLLECTIONS = {
  ORGANISATIONS: 'epr-organisations',
  PACKAGING_RECYCLING_NOTES: 'packaging-recycling-notes',
  WASTE_BALANCES: 'waste-balances',
  REPORTS: 'reports',
  WASTE_RECORDS: 'waste-records',
  SUMMARY_LOGS: 'summary-logs',
  OVERSEAS_SITES: 'overseas-sites'
}

const isValidObjectIdHex = (id) => /^[0-9a-fA-F]{24}$/.test(id)

const toObjectId = (id) => ObjectId.createFromHexString(id)

/**
 * @param {Db} db
 * @param {string} orgId
 */
const findOrganisationForCleanup = async (db, orgId) => {
  if (!isValidObjectIdHex(orgId)) {
    return null
  }
  return db
    .collection(COLLECTIONS.ORGANISATIONS)
    .findOne({ _id: toObjectId(orgId) })
}

const extractCascadeKeys = (organisation) => {
  if (!organisation) {
    return { accreditationIds: [], overseasSiteIds: [] }
  }
  const accreditationIds = (organisation.accreditations ?? []).map((a) => a.id)
  const overseasSiteIds = (organisation.registrations ?? []).flatMap((reg) =>
    Object.values(reg.overseasSites ?? {}).map((entry) => entry.overseasSiteId)
  )
  return { accreditationIds, overseasSiteIds }
}

/**
 * Declarative description of the cascade. Each step names the collection to
 * clear and the filter to apply. A null filter short-circuits the step and
 * yields a count of 0 (used when the org has no data in that collection).
 *
 * Order is downstream-to-root so nothing points at a parent that has already
 * been deleted, though deleteMany semantics make the order idempotent anyway.
 *
 * @param {string} orgId
 * @param {{ accreditationIds: string[], overseasSiteIds: string[] }} keys
 */
const buildCascadeSteps = (orgId, { accreditationIds, overseasSiteIds }) => [
  {
    label: 'packaging-recycling-notes',
    collection: COLLECTIONS.PACKAGING_RECYCLING_NOTES,
    filter: { 'organisation.id': orgId }
  },
  {
    label: 'waste-balances',
    collection: COLLECTIONS.WASTE_BALANCES,
    filter:
      accreditationIds.length === 0
        ? null
        : { accreditationId: { $in: accreditationIds } }
  },
  {
    label: 'reports',
    collection: COLLECTIONS.REPORTS,
    filter: { organisationId: orgId }
  },
  {
    label: 'waste-records',
    collection: COLLECTIONS.WASTE_RECORDS,
    filter: { organisationId: orgId }
  },
  {
    label: 'summary-logs',
    collection: COLLECTIONS.SUMMARY_LOGS,
    filter: { organisationId: orgId }
  },
  {
    label: 'overseas-sites',
    collection: COLLECTIONS.OVERSEAS_SITES,
    filter:
      overseasSiteIds.length === 0
        ? null
        : { _id: { $in: overseasSiteIds.map(toObjectId) } }
  },
  {
    label: 'epr-organisations',
    collection: COLLECTIONS.ORGANISATIONS,
    filter: isValidObjectIdHex(orgId) ? { _id: toObjectId(orgId) } : null
  }
]

/**
 * @param {Db} db
 * @param {ReturnType<typeof buildCascadeSteps>} steps
 */
const runCascade = async (db, steps) => {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const { label, collection, filter } of steps) {
    if (filter === null) {
      counts[label] = 0
      continue
    }
    const result = await db.collection(collection).deleteMany(filter)
    counts[label] = result.deletedCount
  }
  return counts
}

/**
 * Creates the non-prod data reset adapter.
 *
 * This module is intentionally the only place in the codebase that performs a
 * cascade delete across organisation-scoped collections. It is registered via a
 * plugin that is only loaded when FEATURE_FLAG_DEV_ENDPOINTS is enabled, which
 * means the capability does not exist on the request object in production,
 * providing runtime defence beyond the router-level route gate.
 *
 * @param {Db} db
 * @returns {NonProdDataReset}
 */
export const createNonProdDataReset = (db) => ({
  async deleteByOrgId(orgId) {
    const organisation = await findOrganisationForCleanup(db, orgId)
    const keys = extractCascadeKeys(organisation)
    return runCascade(db, buildCascadeSteps(orgId, keys))
  }
})
