import exporterAccreditation from '#data/fixtures/ea/accreditation/exporter.json'
import reprocessorGlassAccreditation from '#data/fixtures/ea/accreditation/reprocessor-glass.json'
import { MATERIAL } from '#domain/organisations/model.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFormDataMigrator } from './migration/migration-orchestrator.js'

describe('Migration Integration Tests with Fixtures', () => {
  let formsInMemoryRepo
  let organisationsInMemoryRepo

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

  beforeEach(() => {
    const orgFixtures = loadFixtures('organisation')
    const regFixtures = loadFixtures('registration')
    const accrFixtures = loadFixtures('accreditation')

    // Prepare organisation form submission data
    const orgFormSubmissions = orgFixtures.map((fixture) => ({
      id: fixture._id.$oid,
      orgId: fixture.orgId,
      rawSubmissionData: fixture.rawSubmissionData
    }))

    // Prepare registration form submission data
    const regFormSubmissions = regFixtures.map((fixture) => ({
      id: fixture._id.$oid,
      orgId: fixture.orgId,
      rawSubmissionData: fixture.rawSubmissionData
    }))

    // Prepare accreditation form submission data
    const accFormSubmissions = accrFixtures.map((fixture) => ({
      id: fixture._id.$oid,
      orgId: fixture.orgId,
      rawSubmissionData: fixture.rawSubmissionData
    }))

    formsInMemoryRepo = createFormSubmissionsRepository(
      accFormSubmissions,
      regFormSubmissions,
      orgFormSubmissions
    )()
    organisationsInMemoryRepo = createInMemoryOrganisationsRepository()()
  })

  it('migrates org form submissions from EA fixtures using in-memory repositories', async () => {
    // Run migration
    const formsDataMigration = createFormDataMigrator(
      formsInMemoryRepo,
      organisationsInMemoryRepo
    )
    await formsDataMigration.migrate()

    // Verify organisations were created
    const allOrgs = await organisationsInMemoryRepo.findAll()
    expect(allOrgs).toHaveLength(8)

    // Create a map of organisations by orgId for easy lookup
    const orgsByOrgId = allOrgs.reduce(
      (map, org) => map.set(org.orgId, org),
      new Map()
    )

    // Count total registrations across all orgs
    const totalRegistrations = allOrgs.reduce(
      (count, org) => count + (org.registrations?.length || 0),
      0
    )
    expect(totalRegistrations).toBe(3)

    // Count total accreditations across all orgs
    const totalAccreditations = allOrgs.reduce(
      (count, org) => count + (org.accreditations?.length || 0),
      0
    )
    expect(totalAccreditations).toBe(5)

    // Verify registrations count by org
    const org503181 = orgsByOrgId.get(503181)
    expect(org503181).toBeDefined()
    expect(org503181.registrations).toHaveLength(1)

    const org503176 = orgsByOrgId.get(503176)
    expect(org503176).toBeDefined()
    expect(org503176.registrations).toHaveLength(2)

    // Verify accreditations count by org
    expect(org503181.accreditations).toHaveLength(1)
    expect(org503176.accreditations).toHaveLength(3)

    const org503177 = orgsByOrgId.get(503177)
    expect(org503177).toBeDefined()
    expect(org503177.accreditations).toHaveLength(1)

    // Exporter registration SHOULD be linked to exporter accreditation
    expect(org503181.registrations[0].accreditationId).toBe(
      exporterAccreditation._id.$oid
    )

    // Reprocessor registration SHOULD be linked to accreditation
    const glassRegistrations = org503176.registrations.filter(
      (r) => r.material === MATERIAL.GLASS
    )
    expect(glassRegistrations).toHaveLength(1)
    expect(glassRegistrations[0].accreditationId).toBe(
      reprocessorGlassAccreditation._id.$oid
    )
    // Other registrations SHOULD NOT be linked to accreditation
    org503176.registrations
      .filter((r) => r.material !== MATERIAL.GLASS)
      .forEach((reg) => {
        expect(reg.accreditationId).toBeUndefined()
      })

    // All other registrations should NOT be linked (materials/sites don't match or no accreditation)
    const orgsWithMatchingACcreditations = [503181, 503176]
    for (const reg of allOrgs
      .filter((o) => !orgsWithMatchingACcreditations.includes(o.orgId))
      .flatMap((o) => o.registrations ?? [])) {
      expect(reg.accreditationId).toBeUndefined()
    }

    // rerunning migration should not fail
    expect(async () => await formsDataMigration.migrate()).not.toThrow()
  })
})
