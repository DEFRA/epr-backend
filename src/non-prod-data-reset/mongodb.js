import { ObjectId } from 'mongodb'

import { logger } from '#common/helpers/logging/logger.js'
import { organisationNumberOf } from '#domain/organisations/numbers.js'

/** @import { Db } from 'mongodb' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

/**
 * @typedef {{
 *   deleteByOrganisationNumber: (
 *     organisationNumber: OrganisationNumber
 *   ) => Promise<Record<string, number>>
 * }} NonProdDataReset
 */

const COLLECTIONS = {
  ORGANISATION: 'organisation',
  REGISTRATION: 'registration',
  ACCREDITATION: 'accreditation',
  PACKAGING_RECYCLING_NOTES: 'packaging-recycling-notes',
  REPORTS: 'reports',
  SUMMARY_LOGS: 'summary-logs',
  OVERSEAS_SITES: 'overseas-sites',
  SYSTEM_LOGS: 'system-logs',
  WASTE_BALANCE_EVENTS: 'waste-balance-events',
  SUMMARY_LOG_ROW_STATES: 'summary-log-row-states'
}

const EMPTY_COUNTS = Object.freeze({
  'packaging-recycling-notes': 0,
  'waste-balance-events': 0,
  'summary-log-row-states': 0,
  reports: 0,
  'summary-logs': 0,
  'overseas-sites': 0,
  'system-logs': 0,
  registration: 0,
  accreditation: 0,
  'epr-organisations': 0,
  organisation: 0
})

const toObjectId = (id) => ObjectId.createFromHexString(id)

/** @param {Organisation} organisation */
const extractCascadeKeys = (organisation) => {
  const overseasSiteIds = organisation.registrations.flatMap((reg) =>
    Object.values(reg.overseasSites ?? {}).map((entry) => entry.overseasSiteId)
  )
  return { overseasSiteIds }
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
 * organisation's id, so they join against organisationId. The
 * 'registration', 'accreditation' and 'organisation' collections (written by
 * the journey-test apply path) are keyed by the numeric orgId. PRNs, reports
 * and report system logs carry the organisation number instead.
 *
 * @param {Organisation} organisation
 * @param {{ overseasSiteIds: string[] }} keys
 */
const buildCascadeSteps = (organisation, { overseasSiteIds }) => {
  const { orgId, id: organisationId } = organisation
  const organisationNumber = organisationNumberOf(organisation)
  return [
    {
      label: 'packaging-recycling-notes',
      collection: COLLECTIONS.PACKAGING_RECYCLING_NOTES,
      filter: { 'organisation.organisationNumber': organisationNumber }
    },
    {
      label: 'waste-balance-events',
      collection: COLLECTIONS.WASTE_BALANCE_EVENTS,
      filter: { organisationId }
    },
    {
      label: 'summary-log-row-states',
      collection: COLLECTIONS.SUMMARY_LOG_ROW_STATES,
      filter: { organisationId }
    },
    {
      label: 'reports',
      collection: COLLECTIONS.REPORTS,
      filter: { organisationNumber }
    },
    {
      label: 'summary-logs',
      collection: COLLECTIONS.SUMMARY_LOGS,
      filter: { organisationId }
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
      filter: {
        $or: [
          { 'context.organisationId': organisationId },
          { 'context.organisationNumber': organisationNumber }
        ]
      }
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
      label: 'organisation',
      collection: COLLECTIONS.ORGANISATION,
      filter: { orgId }
    }
  ]
}

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
 * As a final safety net, deleteByOrganisationNumber refuses to run when
 * isProduction is true and logs an error.
 *
 * @param {Db} db
 * @param {Pick<OrganisationsRepository, 'findByOrganisationNumber' | 'deleteByOrganisationNumber'>} organisationsRepository
 * @param {{ isProduction?: boolean }} [options]
 * @returns {NonProdDataReset}
 */
export const createNonProdDataReset = (
  db,
  organisationsRepository,
  { isProduction = false } = {}
) => ({
  async deleteByOrganisationNumber(organisationNumber) {
    if (isProduction) {
      logger.error({
        message:
          'Refusing to run non-prod cascade delete in production environment.',
        event: { reference: `organisationNumber=${organisationNumber}` }
      })
      throw new Error('Non-prod data reset is disabled in production.')
    }
    const organisation =
      await organisationsRepository.findByOrganisationNumber(organisationNumber)
    if (!organisation) {
      return { ...EMPTY_COUNTS }
    }
    const keys = extractCascadeKeys(organisation)
    const [counts, deletedOrganisations] = await Promise.all([
      runCascade(db, buildCascadeSteps(organisation, keys)),
      organisationsRepository.deleteByOrganisationNumber(organisationNumber)
    ])
    return { ...counts, 'epr-organisations': deletedOrganisations }
  }
})
