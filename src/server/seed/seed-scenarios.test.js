import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertPresent } from '#test/type-helpers.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  ACCREDITATION_STATUS,
  ORGANISATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import {
  createEprOrganisationScenarios,
  SCENARIO_ORGANISATION_NUMBERS
} from './seed-scenarios.js'

/**
 * Wait for the inmemory repository's stale cache to sync.
 * The repository uses setImmediate for cache updates.
 *
 * Note: We can't use waitForVersion here because createEprOrganisationScenarios
 * doesn't return the created organisations, and we query using findAll() with
 * organisation number filtering rather than findById().
 */
const waitForCacheSync = () => new Promise((resolve) => setImmediate(resolve))

describe('seed-scenarios', () => {
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */
  let repository

  beforeEach(() => {
    repository = createInMemoryOrganisationsRepository()()
  })

  describe('createEprOrganisationScenarios', () => {
    it('creates approved, active, and active-with-rejected-accreditation scenarios', async () => {
      await createEprOrganisationScenarios(repository)

      const orgs = await repository.findAll()
      const numbers = Object.values(SCENARIO_ORGANISATION_NUMBERS)
      const scenarioOrgs = orgs.filter((org) =>
        numbers.includes(org.organisationNumber)
      )

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
        createEprOrganisationScenarios(repository)
      ).resolves.not.toThrow()

      // Verify all scenarios were created successfully
      await waitForCacheSync()
      const orgs = await repository.findAll()
      const numbers = Object.values(SCENARIO_ORGANISATION_NUMBERS)
      const scenarioOrgs = orgs.filter((org) =>
        numbers.includes(org.organisationNumber)
      )

      expect(scenarioOrgs).toHaveLength(3)

      // Verify each has required fields populated correctly
      for (const org of scenarioOrgs) {
        expect(org.id).toBeDefined()
        expect(org.organisationNumber).toBeDefined()
        expect(org.version).toBeGreaterThanOrEqual(1)
        expect(org.statusHistory).toBeDefined()
        expect(org.statusHistory.length).toBeGreaterThan(0)
        expect(org.registrations).toBeDefined()
        expect(org.accreditations).toBeDefined()
      }
    })

    it('creates an approved organisation with approved registration and accreditation', async () => {
      await createEprOrganisationScenarios(repository)
      await waitForCacheSync()

      const orgs = await repository.findAll()
      const approvedOrg = orgs.find(
        (org) =>
          org.organisationNumber === SCENARIO_ORGANISATION_NUMBERS.APPROVED
      )
      assertPresent(approvedOrg)

      expect(approvedOrg.status).toBe(ORGANISATION_STATUS.APPROVED)
      expect(
        approvedOrg.registrations.some(
          (r) => r.status === REGISTRATION_STATUS.APPROVED
        )
      ).toBe(true)
      expect(
        approvedOrg.accreditations.some(
          (a) => a.status === ACCREDITATION_STATUS.APPROVED
        )
      ).toBe(true)
      // Users are collated automatically by the repository when status changes
      expect(approvedOrg.users.length).toBeGreaterThan(0)
      // The approved tester should be included via approvedPersons
      expect(
        approvedOrg.users.some((u) => u.email === 'approved-tester@example.com')
      ).toBe(true)
    })

    it('numbers registrations and accreditations in the production format', async () => {
      await createEprOrganisationScenarios(repository)
      await waitForCacheSync()

      const orgs = await repository.findAll()
      const approvedOrg = orgs.find(
        (org) =>
          org.organisationNumber === SCENARIO_ORGANISATION_NUMBERS.APPROVED
      )
      assertPresent(approvedOrg)

      for (const { registrationNumber } of approvedOrg.registrations) {
        expect(registrationNumber).toMatch(/^R\d{2}[A-Z0-9]+$/)
      }
      for (const { accreditationNumber } of approvedOrg.accreditations) {
        expect(accreditationNumber).toMatch(/^A\d{2}[A-Z0-9]+$/)
      }
    })

    it('creates an active organisation with approved registration and accreditation', async () => {
      await createEprOrganisationScenarios(repository)
      await waitForCacheSync()

      const orgs = await repository.findAll()
      const activeOrg = orgs.find(
        (org) => org.organisationNumber === SCENARIO_ORGANISATION_NUMBERS.ACTIVE
      )
      assertPresent(activeOrg)

      expect(activeOrg.status).toBe(ORGANISATION_STATUS.ACTIVE)
      expect(activeOrg.linkedDefraOrganisation).toBeDefined()
      expect(activeOrg.users.length).toBeGreaterThan(0)
      expect(
        activeOrg.registrations.some(
          (r) => r.status === REGISTRATION_STATUS.APPROVED
        )
      ).toBe(true)
      expect(
        activeOrg.accreditations.some(
          (a) => a.status === ACCREDITATION_STATUS.APPROVED
        )
      ).toBe(true)
    })

    it('creates an active organisation with suspended accreditation', async () => {
      await createEprOrganisationScenarios(repository)
      await waitForCacheSync()

      const orgs = await repository.findAll()
      const mixedOrg = orgs.find(
        (org) =>
          org.organisationNumber ===
          SCENARIO_ORGANISATION_NUMBERS.ACTIVE_WITH_SUSPENDED_ACCREDITATION
      )
      assertPresent(mixedOrg)

      expect(mixedOrg.status).toBe(ORGANISATION_STATUS.ACTIVE)
      expect(
        mixedOrg.registrations.some(
          (r) => r.status === REGISTRATION_STATUS.APPROVED
        )
      ).toBe(true)
      expect(
        mixedOrg.accreditations.some(
          (a) => a.status === ACCREDITATION_STATUS.SUSPENDED
        )
      ).toBe(true)
    })

    it('uses tester email from environment variable for active org', async () => {
      const originalEnv = process.env.SEED_TESTER_EMAIL
      process.env.SEED_TESTER_EMAIL = 'custom-tester@example.com'

      try {
        await createEprOrganisationScenarios(repository)
        await waitForCacheSync()

        const orgs = await repository.findAll()
        const activeOrg = orgs.find(
          (org) =>
            org.organisationNumber === SCENARIO_ORGANISATION_NUMBERS.ACTIVE
        )
        assertPresent(activeOrg)

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

    it('uses approved tester email from environment variable for approved org', async () => {
      const originalEnv = process.env.SEED_APPROVED_TESTER_EMAIL
      process.env.SEED_APPROVED_TESTER_EMAIL =
        'custom-approved-tester@example.com'

      try {
        await createEprOrganisationScenarios(repository)
        await waitForCacheSync()

        const orgs = await repository.findAll()
        const approvedOrg = orgs.find(
          (org) =>
            org.organisationNumber === SCENARIO_ORGANISATION_NUMBERS.APPROVED
        )
        assertPresent(approvedOrg)

        expect(
          approvedOrg.users.some(
            (u) => u.email === 'custom-approved-tester@example.com'
          )
        ).toBe(true)
      } finally {
        if (originalEnv === undefined) {
          delete process.env.SEED_APPROVED_TESTER_EMAIL
        } else {
          process.env.SEED_APPROVED_TESTER_EMAIL = originalEnv
        }
      }
    })

    it('skips seeding when scenarios already exist', async () => {
      // First run - should create scenarios
      await createEprOrganisationScenarios(repository)

      await waitForCacheSync()

      const insertSpy = vi.spyOn(repository, 'insert')
      insertSpy.mockClear()

      // Second run - should skip
      await createEprOrganisationScenarios(repository)

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
        createEprOrganisationScenarios(failingRepository)
      ).resolves.not.toThrow()

      // Should have attempted all 3 scenarios despite first failing
      // The first scenario fails, so only 2 should succeed
      const orgs = await failingRepository.findAll()
      expect(orgs.length).toBe(2)
    })
  })
})
