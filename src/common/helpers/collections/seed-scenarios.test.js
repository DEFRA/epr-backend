import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS
} from '#domain/organisations/model.js'
import {
  createEprOrganisationScenarios,
  SCENARIO_ORG_IDS
} from './seed-scenarios.js'

/** @import {Db} from 'mongodb' */

/**
 * @param {{ find?: () => { toArray: () => Promise<object[]> } }} options
 * @returns {Db}
 */
function createMockDb({ find = () => ({ toArray: async () => [] }) } = {}) {
  return /** @type {Db} */ (
    /** @type {unknown} */ ({
      collection: () => ({
        find,
        countDocuments: async () => 0
      })
    })
  )
}

describe('seed-scenarios', () => {
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */
  let repository
  /** @type {Db} */
  let mockDb

  beforeEach(() => {
    repository = createInMemoryOrganisationsRepository()()
    mockDb = createMockDb()
  })

  describe('createEprOrganisationScenarios', () => {
    it('creates approved, active, and active-with-rejected-accreditation scenarios', async () => {
      await createEprOrganisationScenarios(mockDb, repository)

      const orgs = await repository.findAll()
      const orgIds = Object.values(SCENARIO_ORG_IDS)
      const scenarioOrgs = orgs.filter((org) => orgIds.includes(org.orgId))

      expect(scenarioOrgs).toHaveLength(3)
    })

    it('all scenarios pass schema validation (no errors during creation)', async () => {
      // This test verifies that the repository's built-in schema validation
      // doesn't throw during scenario creation. The repository validates
      // on insert() and replace() using organisationInsertSchema and
      // organisationReplaceSchema respectively.
      //
      // If this test passes without errors, the scenarios are schema-valid.
      // We don't need to manually validate - the repository already does this.
      await expect(
        createEprOrganisationScenarios(mockDb, repository)
      ).resolves.not.toThrow()

      // Verify all scenarios were created successfully
      await new Promise((resolve) => setTimeout(resolve, 50))
      const orgs = await repository.findAll()
      const orgIds = Object.values(SCENARIO_ORG_IDS)
      const scenarioOrgs = orgs.filter((org) => orgIds.includes(org.orgId))

      expect(scenarioOrgs).toHaveLength(3)

      // Verify each has required fields populated correctly
      for (const org of scenarioOrgs) {
        expect(org.id).toBeDefined()
        expect(org.orgId).toBeDefined()
        expect(org.version).toBeGreaterThanOrEqual(1)
        expect(org.statusHistory).toBeDefined()
        expect(org.statusHistory.length).toBeGreaterThan(0)
        expect(org.registrations).toBeDefined()
        expect(org.accreditations).toBeDefined()
      }
    })

    it('creates an approved organisation with approved registration and accreditation', async () => {
      await createEprOrganisationScenarios(mockDb, repository)

      // Wait for inmemory repository's stale cache to sync (uses setImmediate)
      await new Promise((resolve) => setImmediate(resolve))

      // Find the org by querying all orgs
      const orgs = await repository.findAll()
      const approvedOrg = orgs.find(
        (org) => org.orgId === SCENARIO_ORG_IDS.APPROVED
      )

      expect(approvedOrg).toBeDefined()
      expect(approvedOrg.status).toBe(ORGANISATION_STATUS.APPROVED)
      expect(
        approvedOrg.registrations.some(
          (r) => r.status === REG_ACC_STATUS.APPROVED
        )
      ).toBe(true)
      expect(
        approvedOrg.accreditations.some(
          (a) => a.status === REG_ACC_STATUS.APPROVED
        )
      ).toBe(true)
    })

    it('creates an active organisation with approved registration and accreditation', async () => {
      await createEprOrganisationScenarios(mockDb, repository)

      // Wait for inmemory repository's stale cache to sync (uses setImmediate)
      await new Promise((resolve) => setImmediate(resolve))

      const orgs = await repository.findAll()
      const activeOrg = orgs.find(
        (org) => org.orgId === SCENARIO_ORG_IDS.ACTIVE
      )

      expect(activeOrg).toBeDefined()
      expect(activeOrg.status).toBe(ORGANISATION_STATUS.ACTIVE)
      expect(activeOrg.linkedDefraOrganisation).toBeDefined()
      expect(activeOrg.users.length).toBeGreaterThan(0)
      expect(
        activeOrg.registrations.some(
          (r) => r.status === REG_ACC_STATUS.APPROVED
        )
      ).toBe(true)
      expect(
        activeOrg.accreditations.some(
          (a) => a.status === REG_ACC_STATUS.APPROVED
        )
      ).toBe(true)
    })

    it('creates an active organisation with suspended accreditation', async () => {
      await createEprOrganisationScenarios(mockDb, repository)

      // Wait for inmemory repository's stale cache to sync (uses setImmediate)
      await new Promise((resolve) => setTimeout(resolve, 100))

      const orgs = await repository.findAll()
      const mixedOrg = orgs.find(
        (org) =>
          org.orgId === SCENARIO_ORG_IDS.ACTIVE_WITH_SUSPENDED_ACCREDITATION
      )

      expect(mixedOrg).toBeDefined()
      expect(mixedOrg.status).toBe(ORGANISATION_STATUS.ACTIVE)
      expect(
        mixedOrg.registrations.some((r) => r.status === REG_ACC_STATUS.APPROVED)
      ).toBe(true)
      expect(
        mixedOrg.accreditations.some(
          (a) => a.status === REG_ACC_STATUS.SUSPENDED
        )
      ).toBe(true)
    })

    it('uses tester email from environment variable when set', async () => {
      const originalEnv = process.env.SEED_TESTER_EMAIL
      process.env.SEED_TESTER_EMAIL = 'custom-tester@example.com'

      try {
        await createEprOrganisationScenarios(mockDb, repository)

        // Wait for inmemory repository's stale cache to sync
        await new Promise((resolve) => setTimeout(resolve, 100))

        const orgs = await repository.findAll()
        const activeOrg = orgs.find(
          (org) => org.orgId === SCENARIO_ORG_IDS.ACTIVE
        )

        expect(
          activeOrg.users.some((u) => u.email === 'custom-tester@example.com')
        ).toBe(true)
      } finally {
        if (originalEnv === undefined) {
          delete process.env.SEED_TESTER_EMAIL
        } else {
          process.env.SEED_TESTER_EMAIL = originalEnv
        }
      }
    })

    it('skips seeding when scenarios already exist', async () => {
      // First run - should create scenarios
      await createEprOrganisationScenarios(mockDb, repository)

      // Mock DB to return existing scenarios
      const mockDbWithExisting = createMockDb({
        find: () => ({
          toArray: async () => [{ orgId: SCENARIO_ORG_IDS.APPROVED }]
        })
      })

      const insertSpy = vi.spyOn(repository, 'insert')
      insertSpy.mockClear()

      // Second run - should skip
      await createEprOrganisationScenarios(mockDbWithExisting, repository)

      expect(insertSpy).not.toHaveBeenCalled()
    })

    it('handles scenario build errors gracefully and continues with other scenarios', async () => {
      // Mock repository to fail on the first insert
      const failingRepository = createInMemoryOrganisationsRepository()()
      let callCount = 0
      const originalInsert = failingRepository.insert.bind(failingRepository)

      vi.spyOn(failingRepository, 'insert').mockImplementation(async (org) => {
        callCount++
        if (callCount === 1) {
          throw new Error('Simulated database error')
        }
        return originalInsert(org)
      })

      // Should not throw - errors are caught and logged
      await expect(
        createEprOrganisationScenarios(mockDb, failingRepository)
      ).resolves.not.toThrow()

      // Should have attempted all 3 scenarios despite first failing
      // The first scenario fails, so only 2 should succeed
      const orgs = await failingRepository.findAll()
      expect(orgs.length).toBe(2)
    })
  })
})
