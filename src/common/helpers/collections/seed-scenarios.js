/**
 * Seed data scenarios for non-prod environments
 *
 * This module defines programmatic scenarios for seeding EPR organisations
 * in various states (approved, active, etc.) to support testing.
 *
 * @see docs/architecture/decisions/0001-hybrid-seed-data-strategy-for-non-prod-environments.md
 */

import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'

import {
  REPROCESSING_TYPE,
  ORGANISATION_STATUS,
  REG_ACC_STATUS,
  USER_ROLES
} from '#domain/organisations/model.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  buildOrganisation,
  getValidDateRange,
  prepareOrgUpdate
} from '#repositories/organisations/contract/test-data.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'

/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {Db} from 'mongodb' */

const COLLECTION_EPR_ORGANISATIONS = 'epr-organisations'

/**
 * Well-known orgIds for seed scenarios.
 * These are fixed to enable idempotent seeding.
 */
export const SCENARIO_ORG_IDS = Object.freeze({
  APPROVED: 50020,
  ACTIVE: 50030,
  ACTIVE_WITH_SUSPENDED_ACCREDITATION: 50040
})

/**
 * Tester email for active org - can be overridden via environment variable.
 * This user is added when the organisation is linked to DefraId.
 */
const getTesterEmail = () =>
  process.env.SEED_TESTER_EMAIL || 'tester@example.com'

/**
 * Tester email for approved org - can be overridden via environment variable.
 * This user is added as an approved person on the registration, simulating
 * a user who came through the form submission process.
 */
const getApprovedTesterEmail = () =>
  process.env.SEED_APPROVED_TESTER_EMAIL || 'approved-tester@example.com'

/**
 * Creates an approved organisation with approved registration and accreditation
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {object} overrides
 * @returns {Promise<object>}
 */
async function buildApprovedOrgForSeed(
  organisationsRepository,
  overrides = {}
) {
  const org = buildOrganisation({
    id: new ObjectId().toString(),
    ...overrides
  })

  const INITIAL_VERSION = 1

  await organisationsRepository.insert(org)

  const { VALID_FROM, VALID_TO } = getValidDateRange()

  const approvedTesterEmail = getApprovedTesterEmail()

  const approvedRegistrations = [
    {
      ...org.registrations[0],
      status: REG_ACC_STATUS.APPROVED,
      registrationNumber: `REG-${org.orgId}-001`,
      cbduNumber: `CBDU${org.orgId}`,
      reprocessingType: REPROCESSING_TYPE.INPUT,
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      approvedPersons: [
        ...org.registrations[0].approvedPersons,
        {
          fullName: 'Approved Tester',
          email: approvedTesterEmail,
          phone: '0123456789',
          jobTitle: 'Tester'
        }
      ]
    }
  ]

  const approvedAccreditations = [
    {
      ...org.accreditations[0],
      status: REG_ACC_STATUS.APPROVED,
      accreditationNumber: `ACC-${org.orgId}-001`,
      reprocessingType: REPROCESSING_TYPE.INPUT,
      validFrom: VALID_FROM,
      validTo: VALID_TO
    }
  ]

  await organisationsRepository.replace(
    org.id,
    INITIAL_VERSION,
    prepareOrgUpdate(org, {
      status: ORGANISATION_STATUS.APPROVED,
      registrations: approvedRegistrations,
      accreditations: approvedAccreditations
    })
  )

  return waitForVersion(organisationsRepository, org.id, INITIAL_VERSION + 1)
}

/**
 * Creates an active organisation with approved registration and accreditation,
 * linked to a DefraId organisation
 *
 * Note: Registrations and accreditations remain in APPROVED status.
 * They do NOT transition to ACTIVE when the organisation becomes active.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {object} overrides
 * @returns {Promise<object>}
 */
async function buildActiveOrgForSeed(organisationsRepository, overrides = {}) {
  const testerEmail = getTesterEmail()
  const org = await buildApprovedOrgForSeed(organisationsRepository, overrides)

  const linkedDefraOrg = {
    orgId: crypto.randomUUID(),
    orgName: `${org.companyDetails.name} (Linked)`,
    linkedBy: {
      email: testerEmail,
      id: crypto.randomUUID()
    },
    linkedAt: new Date().toISOString()
  }

  const currentVersion = org.version

  await organisationsRepository.replace(
    org.id,
    currentVersion,
    prepareOrgUpdate(org, {
      status: ORGANISATION_STATUS.ACTIVE,
      linkedDefraOrganisation: linkedDefraOrg,
      users: [
        {
          email: testerEmail,
          fullName: 'Test User',
          roles: [USER_ROLES.STANDARD]
        }
      ]
    })
  )

  return waitForVersion(organisationsRepository, org.id, currentVersion + 1)
}

/**
 * Creates an active organisation where one accreditation is suspended
 * while its corresponding registration remains approved
 *
 * Note: APPROVED → SUSPENDED is a valid status transition for accreditations.
 * APPROVED → REJECTED is NOT valid (REJECTED can only come from CREATED).
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {object} overrides
 * @returns {Promise<object>}
 */
async function buildActiveOrgWithSuspendedAccreditation(
  organisationsRepository,
  overrides = {}
) {
  const org = await buildActiveOrgForSeed(organisationsRepository, overrides)

  // Find the first approved registration's material to match with accreditation
  // Note: buildActiveOrgForSeed guarantees at least one approved registration
  const approvedReg = org.registrations.find(
    (r) => r.status === REG_ACC_STATUS.APPROVED
  )
  const matchingAccIndex = org.accreditations.findIndex(
    (acc) => acc.material === approvedReg.material
  )

  const updatedAccreditations = org.accreditations.map(
    (/** @type {object} */ acc, /** @type {number} */ index) =>
      index === matchingAccIndex
        ? { ...acc, status: REG_ACC_STATUS.SUSPENDED }
        : acc
  )

  const currentVersion = org.version

  await organisationsRepository.replace(
    org.id,
    currentVersion,
    prepareOrgUpdate(org, {
      accreditations: updatedAccreditations
    })
  )

  return waitForVersion(organisationsRepository, org.id, currentVersion + 1)
}

/**
 * Scenario definitions for seed data
 *
 * @type {Record<string, {orgId: number, description: string, build: (repo: OrganisationsRepository) => Promise<object>}>}
 */
const SEED_SCENARIOS = {
  approved_organisation: {
    orgId: SCENARIO_ORG_IDS.APPROVED,
    description:
      'Approved organisation with approved registration and accreditation',
    build: (repo) =>
      buildApprovedOrgForSeed(repo, {
        orgId: SCENARIO_ORG_IDS.APPROVED
      })
  },

  active_organisation: {
    orgId: SCENARIO_ORG_IDS.ACTIVE,
    description:
      'Active organisation linked to DefraId with approved registration/accreditation',
    build: (repo) =>
      buildActiveOrgForSeed(repo, {
        orgId: SCENARIO_ORG_IDS.ACTIVE
      })
  },

  active_with_suspended_accreditation: {
    orgId: SCENARIO_ORG_IDS.ACTIVE_WITH_SUSPENDED_ACCREDITATION,
    description:
      'Active organisation with approved registration but suspended accreditation',
    build: (repo) =>
      buildActiveOrgWithSuspendedAccreditation(repo, {
        orgId: SCENARIO_ORG_IDS.ACTIVE_WITH_SUSPENDED_ACCREDITATION
      })
  }
}

/**
 * Seeds EPR organisation state variations programmatically
 *
 * Only seeds if the scenarios don't already exist in the database.
 * Uses fixed orgIds to enable idempotent seeding.
 *
 * @param {Db} db - MongoDB database instance
 * @param {OrganisationsRepository} organisationsRepository
 * @returns {Promise<void>}
 */
export async function createEprOrganisationScenarios(
  db,
  organisationsRepository
) {
  const scenarioOrgIds = Object.values(SEED_SCENARIOS).map((s) => s.orgId)

  const existingScenarios = await db
    .collection(COLLECTION_EPR_ORGANISATIONS)
    .find({ orgId: { $in: scenarioOrgIds } })
    .toArray()

  if (existingScenarios.length > 0) {
    logger.info({
      message: `Seed scenarios: skipping, ${existingScenarios.length} scenario(s) already exist`
    })
    return
  }

  logger.info({
    message: 'Seed scenarios: inserting epr-organisation state variations'
  })

  for (const [name, scenario] of Object.entries(SEED_SCENARIOS)) {
    try {
      await scenario.build(organisationsRepository)
      logger.info({
        message: `Seed scenarios: created ${name} (orgId: ${scenario.orgId})`
      })
    } catch (error) {
      logger.error({
        error,
        message: `Seed scenarios: failed to create ${name}`
      })
    }
  }
}
