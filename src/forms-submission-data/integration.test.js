import exporterAccreditation from '#data/fixtures/ea/accreditation/exporter.json'
import reprocessorGlassAccreditation from '#data/fixtures/ea/accreditation/reprocessor-glass.json'
import { MATERIAL } from '#domain/organisations/model.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createFormDataMigrator } from './migration/migration-orchestrator.js'

describe('Migration Integration Tests with Fixtures', () => {
  let sharedOrganisationsRepo
  let sharedSystemLogsRepo

  function loadFixtures(fixtureType) {
    const fixturesDir = join(
      process.cwd(),
      `src/data/fixtures/ea/${fixtureType}`
    )
    const fixtureFiles = readdirSync(fixturesDir).filter((file) =>
      file.endsWith('.json')
    )

    return fixtureFiles.map((filename) => {
      const filePath = join(fixturesDir, filename)
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    })
  }

  async function verifyIncrementalMigrationAudit(
    organisationId,
    expectedAccreditationsCount
  ) {
    const orgLogs =
      await sharedSystemLogsRepo.findByOrganisationId(organisationId)
    expect(orgLogs.length).toBeGreaterThan(0)

    const incrementalMigrationLogs = orgLogs.filter(
      (log) => log.event?.action === 'incremental-form-migration'
    )
    expect(incrementalMigrationLogs.length).toBeGreaterThan(0)

    // Verify the audit log contains correct state transitions
    const latestLog =
      incrementalMigrationLogs[incrementalMigrationLogs.length - 1]
    const { previous, next } = latestLog.context

    // Verify previous state had no accreditations
    expect(previous.accreditations || []).toHaveLength(0)

    // Verify next state has expected accreditations count
    expect(next.accreditations).toHaveLength(expectedAccreditationsCount)
  }

  beforeAll(() => {
    sharedOrganisationsRepo = createInMemoryOrganisationsRepository()()
    sharedSystemLogsRepo = createSystemLogsRepository()()
  })

  function createFormsRepo(includeAllAccreditations) {
    const accrFixtures = loadFixtures('accreditation')
    const orgFixtures = loadFixtures('organisation')
    const regFixtures = loadFixtures('registration')

    const accreditations = includeAllAccreditations ? accrFixtures : []

    const orgFormSubmissions = orgFixtures.map((fixture) => ({
      id: fixture._id.$oid,
      orgId: fixture.orgId,
      rawSubmissionData: fixture.rawSubmissionData
    }))

    const regFormSubmissions = regFixtures.map((fixture) => ({
      id: fixture._id.$oid,
      orgId: fixture.orgId,
      rawSubmissionData: fixture.rawSubmissionData
    }))

    const accFormSubmissions = accreditations.map((fixture) => ({
      id: fixture._id.$oid,
      orgId: fixture.orgId,
      rawSubmissionData: fixture.rawSubmissionData
    }))

    return createFormSubmissionsRepository(
      accFormSubmissions,
      regFormSubmissions,
      orgFormSubmissions
    )()
  }

  describe('Incremental migration', () => {
    it('Part 1: Initial migration without any accreditations', async () => {
      const formsRepo = createFormsRepo(false)

      // Run initial migration
      const formsDataMigration = createFormDataMigrator(
        formsRepo,
        sharedOrganisationsRepo,
        sharedSystemLogsRepo
      )
      await formsDataMigration.migrate()

      // Verify organisations were created
      const allOrgs = await sharedOrganisationsRepo.findAll()
      expect(allOrgs).toHaveLength(8)

      // Create a map of organisations by orgId for easy lookup
      const orgsByOrgId = allOrgs.reduce(
        (map, org) => map.set(org.orgId, org),
        new Map()
      )

      // Count total registrations across all orgs
      // Glass exporter with "Both" processes is split into remelt + other = 4 total
      const totalRegistrations = allOrgs.reduce(
        (count, org) => count + (org.registrations?.length || 0),
        0
      )
      expect(totalRegistrations).toBe(4)

      // Count total accreditations across all orgs (should be 0 - no accreditations yet)
      const totalAccreditations = allOrgs.reduce(
        (count, org) => count + (org.accreditations?.length || 0),
        0
      )
      expect(totalAccreditations).toBe(0)

      // Verify registrations count by org
      // Glass exporter with "Both" processes is split into remelt + other
      const org503181 = orgsByOrgId.get(503181)
      expect(org503181).toBeDefined()
      expect(org503181.registrations).toHaveLength(2)

      const org503176 = orgsByOrgId.get(503176)
      expect(org503176).toBeDefined()
      expect(org503176.registrations).toHaveLength(2)

      const org503177 = orgsByOrgId.get(503177)
      expect(org503177).toBeDefined()
    })

    it('Part 2: Add all accreditations', async () => {
      const formsRepo = createFormsRepo(true)

      // Run migration again with all accreditations
      const formsDataMigration = createFormDataMigrator(
        formsRepo,
        sharedOrganisationsRepo,
        sharedSystemLogsRepo
      )
      await formsDataMigration.migrate()

      // Wait for stale cache to sync (in-memory repo uses setImmediate)
      await new Promise((resolve) => setImmediate(resolve))

      // Verify all accreditations are now present
      const allOrgs = await sharedOrganisationsRepo.findAll()
      expect(allOrgs).toHaveLength(8)

      const totalAccreditations = allOrgs.reduce(
        (count, org) => count + (org.accreditations?.length || 0),
        0
      )
      // exporter-without-registration (org 503177) has both glass processes,
      // so its single accreditation is split into remelt + other = 6 total
      expect(totalAccreditations).toBe(6)

      const org503181 = allOrgs.find((o) => o.orgId === 503181)
      expect(org503181.accreditations).toHaveLength(1)
      // Both split glass registrations (remelt + other) link to the same accreditation
      for (const reg of org503181.registrations) {
        expect(reg.accreditationId).toBe(exporterAccreditation._id.$oid)
      }

      const org503176 = allOrgs.find((o) => o.orgId === 503176)
      expect(org503176.accreditations).toHaveLength(3)
      const glassReg = org503176.registrations.find(
        (r) => r.material === MATERIAL.GLASS
      )
      expect(glassReg.accreditationId).toBe(
        reprocessorGlassAccreditation._id.$oid
      )

      await verifyIncrementalMigrationAudit(org503181.id, 1)
      await verifyIncrementalMigrationAudit(org503176.id, 3)
    })
  })
})
