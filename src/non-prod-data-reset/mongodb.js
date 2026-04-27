import { ObjectId } from 'mongodb'

import { logger } from '#common/helpers/logging/logger.js'

/** @import { Db } from 'mongodb' */

/**
 * @typedef {{
 *   deleteByOrgId: (orgId: number) => Promise<Record<string, number>>
 * }} NonProdDataReset
 */

const COLLECTIONS = {
  ORGANISATIONS: 'epr-organisations',
  ORGANISATION: 'organisation',
  REGISTRATION: 'registration',
  ACCREDITATION: 'accreditation',
  PACKAGING_RECYCLING_NOTES: 'packaging-recycling-notes',
  WASTE_BALANCES: 'waste-balances',
  REPORTS: 'reports',
  WASTE_RECORDS: 'waste-records',
  SUMMARY_LOGS: 'summary-logs',
  OVERSEAS_SITES: 'overseas-sites',
  SYSTEM_LOGS: 'system-logs'
}

const EMPTY_COUNTS = Object.freeze({
  'packaging-recycling-notes': 0,
  'waste-balances': 0,
  reports: 0,
  'waste-records': 0,
  'summary-logs': 0,
  'overseas-sites': 0,
  'system-logs': 0,
  registration: 0,
  accreditation: 0,
  'epr-organisations': 0,
  organisation: 0
})

const toObjectId = (id) => ObjectId.createFromHexString(id)

/**
 * Looks up the organisation by its numeric orgId (the stable identifier used
 * by journey tests and upstream systems), not the Mongo _id. Shape validation
 * for the incoming id lives at the route layer.
 *
 * @param {Db} db
 * @param {number} orgId
 */
const findOrganisationForCleanup = async (db, orgId) =>
  db.collection(COLLECTIONS.ORGANISATIONS).findOne({ orgId })

const extractCascadeKeys = (organisation) => {
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
 * Steps are executed in parallel by runCascade. Order within this array is
 * kept downstream-to-root purely for readability; the filters are independent
 * (each derived from keys already extracted from the organisation document)
 * so there are no ordering constraints between steps.
 *
 * Two different id shapes drive the filters. Most collections store the
 * epr-organisations _id hex on the document, so they join against mongoIdHex.
 * The 'organisation' collection (written by the journey-test apply path) is
 * keyed by the numeric orgId, so its filter joins against orgId directly.
 *
 * @param {number} orgId
 * @param {string} mongoIdHex
 * @param {{ accreditationIds: string[], overseasSiteIds: string[] }} keys
 */
const buildCascadeSteps = (
  orgId,
  mongoIdHex,
  { accreditationIds, overseasSiteIds }
) => [
  {
    label: 'packaging-recycling-notes',
    collection: COLLECTIONS.PACKAGING_RECYCLING_NOTES,
    filter: { 'organisation.id': mongoIdHex }
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
    filter: { organisationId: mongoIdHex }
  },
  {
    label: 'waste-records',
    collection: COLLECTIONS.WASTE_RECORDS,
    filter: { organisationId: mongoIdHex }
  },
  {
    label: 'summary-logs',
    collection: COLLECTIONS.SUMMARY_LOGS,
    filter: { organisationId: mongoIdHex }
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
    label: 'system-logs',
    collection: COLLECTIONS.SYSTEM_LOGS,
    filter: { 'context.organisationId': mongoIdHex }
  },
  {
    label: 'registration',
    collection: COLLECTIONS.REGISTRATION,
    filter: { orgId }
  },
  {
    label: 'accreditation',
    collection: COLLECTIONS.ACCREDITATION,
    filter: { orgId }
  },
  {
    label: 'epr-organisations',
    collection: COLLECTIONS.ORGANISATIONS,
    filter: { _id: toObjectId(mongoIdHex) }
  },
  {
    label: 'organisation',
    collection: COLLECTIONS.ORGANISATION,
    filter: { orgId }
  }
]

/**
 * Executes cascade steps in parallel. deleteMany is idempotent and each
 * step's filter is independent of the others, so Promise.all is safe and
 * meaningfully faster when journey tests batch cleanup across many orgs.
 *
 * @param {Db} db
 * @param {ReturnType<typeof buildCascadeSteps>} steps
 */
const runCascade = async (db, steps) => {
  const entries = await Promise.all(
    steps.map(async ({ label, collection, filter }) => {
      if (filter === null) {
        return /** @type {[string, number]} */ ([label, 0])
      }
      const result = await db.collection(collection).deleteMany(filter)
      return /** @type {[string, number]} */ ([label, result.deletedCount])
    })
  )
  return Object.fromEntries(entries)
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
 * As a final safety net, deleteByOrgId refuses to run when isProduction is
 * true and logs an error.
 *
 * @param {Db} db
 * @param {{ isProduction?: boolean }} [options]
 * @returns {NonProdDataReset}
 */
export const createNonProdDataReset = (db, { isProduction = false } = {}) => ({
  async deleteByOrgId(orgId) {
    if (isProduction) {
      logger.error(
        { event: { reference: String(orgId) } },
        'Refusing to run non-prod cascade delete in production environment.'
      )
      throw new Error('Non-prod data reset is disabled in production.')
    }
    const organisation = await findOrganisationForCleanup(db, orgId)
    if (!organisation) {
      return { ...EMPTY_COUNTS }
    }
    const mongoIdHex = organisation._id.toHexString()
    const keys = extractCascadeKeys(organisation)
    return runCascade(db, buildCascadeSteps(orgId, mongoIdHex, keys))
  }
})
