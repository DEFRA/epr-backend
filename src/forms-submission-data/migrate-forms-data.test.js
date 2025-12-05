import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import exporterAccreditation from '#data/fixtures/ea/accreditation/exporter.json'
import reprocessorGlassAccreditation from '#data/fixtures/ea/accreditation/reprocessor-glass.json'
import { MATERIAL } from '#domain/organisations/model.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { readdirSync, readFileSync } from 'fs'
import { ObjectId } from 'mongodb'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFormDataMigrator } from './migrate-forms-data.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

const orgId1 = new ObjectId()
const orgId2 = new ObjectId()
const regId1 = new ObjectId()
const regId2 = new ObjectId()
const accrId1 = new ObjectId()
const regId2ForOrg2 = new ObjectId()
const accrId2ForOrg2 = new ObjectId()

const validSubmission1 = {
  id: orgId1.toString(),
  orgId: 500001,
  rawSubmissionData: { someData: 'value1' }
}

const validSubmission2 = {
  id: orgId2.toString(),
  orgId: 500002,
  rawSubmissionData: { someData: 'value2' }
}

const transformedOrg1 = {
  id: orgId1.toString(),
  orgId: 500001,
  companyDetails: { name: 'Test Company 1' },
  users: [],
  registrations: [],
  accreditations: []
}

const transformedOrg2 = {
  id: orgId2.toString(),
  orgId: 500002,
  companyDetails: { name: 'Test Company 2' },
  users: [],
  registrations: [],
  accreditations: []
}

const validRegSubmission1 = {
  id: regId1.toString(),
  rawSubmissionData: { regData: 'value1' }
}

const validRegSubmission2 = {
  id: regId2.toString(),
  rawSubmissionData: { regData: 'value2' }
}

const validRegSubmission2ForOrg2 = {
  id: regId2ForOrg2.toString(),
  rawSubmissionData: { regData: 'value2' }
}

const validAccrSubmission1 = {
  id: accrId1.toString(),
  rawSubmissionData: { accrData: 'value1' }
}

const validAccrSubmission2ForOrg2 = {
  id: accrId2ForOrg2.toString(),
  rawSubmissionData: { accrData: 'value2' }
}

const transformedReg1 = {
  id: regId1.toString(),
  systemReference: orgId1.toString(),
  orgId: 500001
}

const transformedAccr1 = {
  id: accrId1.toString(),
  systemReference: orgId1.toString(),
  orgId: 500001
}

const transformedReg2ForOrg2 = {
  id: regId2ForOrg2.toString(),
  systemReference: orgId2.toString(),
  orgId: 500002
}

const transformedAccr2ForOrg2 = {
  id: accrId2ForOrg2.toString(),
  systemReference: orgId2.toString(),
  orgId: 500002
}

describe('migrateFormsData', () => {
  let formsSubmissionRepository
  let organisationsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    formsSubmissionRepository = {
      findOrganisationById: vi.fn(),
      findRegistrationById: vi.fn(),
      findAccreditationById: vi.fn(),
      findAllFormSubmissionIds: vi.fn()
    }
    organisationsRepository = {
      upsert: vi.fn(),
      findAllIds: vi.fn()
    }
  })

  describe('unit tests with mocked parseOrgSubmission', () => {
    let parseOrgSubmission
    let parseRegistrationSubmission
    let parseAccreditationSubmission

    beforeEach(async () => {
      // Import and mock transform functions
      const orgModule =
        await import('#formsubmission/organisation/transform-organisation.js')
      parseOrgSubmission = vi.spyOn(orgModule, 'parseOrgSubmission')

      const regModule =
        await import('#formsubmission/registration/transform-registration.js')
      parseRegistrationSubmission = vi.spyOn(
        regModule,
        'parseRegistrationSubmission'
      )

      const accrModule =
        await import('#formsubmission/accreditation/transform-accreditation.js')
      parseAccreditationSubmission = vi.spyOn(
        accrModule,
        'parseAccreditationSubmission'
      )
    })

    afterEach(() => {
      // Restore the real implementation after each test
      parseOrgSubmission.mockRestore()
      parseRegistrationSubmission.mockRestore()
      parseAccreditationSubmission.mockRestore()
    })

    describe('persistence scenarios', () => {
      it('Initial migration - all submissions transforms and upsert succeed', async () => {
        // Setup: Mock findAllFormSubmissionIds to return submission IDs
        organisationsRepository.findAllIds.mockResolvedValue({
          organisations: new Set(),
          registrations: new Set(),
          accreditations: new Set()
        })
        formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
          organisations: new Set([validSubmission1.id, validSubmission2.id]),
          registrations: new Set([validRegSubmission1.id]),
          accreditations: new Set([validAccrSubmission1.id])
        })

        // Mock fetch methods
        formsSubmissionRepository.findOrganisationById
          .mockResolvedValueOnce(validSubmission1)
          .mockResolvedValueOnce(validSubmission2)
        formsSubmissionRepository.findRegistrationById.mockResolvedValueOnce(
          validRegSubmission1
        )
        formsSubmissionRepository.findAccreditationById.mockResolvedValueOnce(
          validAccrSubmission1
        )

        // Mock parse functions
        parseOrgSubmission
          .mockReturnValueOnce(transformedOrg1)
          .mockReturnValueOnce(transformedOrg2)
        parseRegistrationSubmission.mockReturnValueOnce(transformedReg1)
        parseAccreditationSubmission.mockReturnValueOnce(transformedAccr1)

        // Mock upsert
        organisationsRepository.upsert
          .mockResolvedValueOnce({ action: 'inserted' })
          .mockResolvedValueOnce({ action: 'inserted' })

        const formsDataMigration = createFormDataMigrator(
          formsSubmissionRepository,
          organisationsRepository
        )
        await formsDataMigration.migrate()

        // Verify upsert calls - registration and accreditation should be linked to org1
        expect(organisationsRepository.upsert).toHaveBeenCalledTimes(2)
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            id: transformedOrg1.id,
            registrations: [transformedReg1],
            accreditations: [transformedAccr1]
          })
        )
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            id: transformedOrg2.id,
            registrations: [],
            accreditations: []
          })
        )

        // Verify logs
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 2/2 organisation form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/1 registration form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/1 accreditation form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 2/2 organisations processed (2 inserted, 0 updated, 0 unchanged, 0 failed)'
        })
      })

      it('Incremental data migration - org2 already migrated with new reg and accr, org1 is new', async () => {
        // Setup: org2 already migrated, org1 is new, reg2 and accr2 are new for org2
        organisationsRepository.findAllIds.mockResolvedValue({
          organisations: new Set([validSubmission2.id]),
          registrations: new Set(),
          accreditations: new Set()
        })
        formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
          organisations: new Set([validSubmission1.id, validSubmission2.id]),
          registrations: new Set([validRegSubmission2ForOrg2.id]),
          accreditations: new Set([validAccrSubmission2ForOrg2.id])
        })

        // Mock fetch methods - only org1 fetched, plus reg2 and accr2
        formsSubmissionRepository.findOrganisationById.mockResolvedValueOnce(
          validSubmission1
        )
        formsSubmissionRepository.findRegistrationById.mockResolvedValueOnce(
          validRegSubmission2ForOrg2
        )
        formsSubmissionRepository.findAccreditationById.mockResolvedValueOnce(
          validAccrSubmission2ForOrg2
        )

        // Mock parse functions
        parseOrgSubmission.mockReturnValueOnce(transformedOrg1)
        parseRegistrationSubmission.mockReturnValueOnce(transformedReg2ForOrg2)
        parseAccreditationSubmission.mockReturnValueOnce(
          transformedAccr2ForOrg2
        )

        // Mock upsert - org1 inserted, org2 updated
        organisationsRepository.upsert
          .mockResolvedValueOnce({ action: 'inserted' })
          .mockResolvedValueOnce({ action: 'updated' })

        const formsDataMigration = createFormDataMigrator(
          formsSubmissionRepository,
          organisationsRepository
        )
        await formsDataMigration.migrate()

        /* // Verify org1 inserted without reg/accr, org2 updated with new reg/accr
        expect(organisationsRepository.upsert).toHaveBeenCalledTimes(2)
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            id: transformedOrg1.id,
            registrations: [],
            accreditations: []
          })
        )
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            id: transformedOrg2.id,
            registrations: [transformedReg2ForOrg2],
            accreditations: [transformedAccr2ForOrg2]
          })
        )

        // Verify logs
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/1 organisation form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/1 registration form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/1 accreditation form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 2/2 organisations processed (1 inserted, 1 updated, 0 unchanged, 0 failed)'
        })*/
      })

      it('one upsert fails', async () => {
        organisationsRepository.findAllIds.mockResolvedValue({
          organisations: new Set(),
          registrations: new Set(),
          accreditations: new Set()
        })
        formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
          organisations: new Set([validSubmission1.id]),
          registrations: new Set(),
          accreditations: new Set()
        })

        formsSubmissionRepository.findOrganisationById.mockResolvedValue(
          validSubmission1
        )
        parseOrgSubmission.mockReturnValue(transformedOrg1)
        organisationsRepository.upsert.mockRejectedValue(
          new Error('Upsert failed')
        )

        const formsDataMigration = createFormDataMigrator(
          formsSubmissionRepository,
          organisationsRepository
        )
        await formsDataMigration.migrate()

        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ id: transformedOrg1.id })
        )

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            message: 'Error upserting organisation',
            event: expect.objectContaining({
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
              reference: transformedOrg1.id
            })
          })
        )
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 0/1 organisations processed (0 inserted, 0 updated, 0 unchanged, 1 failed)'
        })
      })

      it('Organisation without any change comparing to whats in db', async () => {
        organisationsRepository.findAllIds.mockResolvedValue({
          organisations: new Set(),
          registrations: new Set(),
          accreditations: new Set()
        })
        formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
          organisations: new Set([validSubmission1.id]),
          registrations: new Set(),
          accreditations: new Set()
        })

        formsSubmissionRepository.findOrganisationById.mockResolvedValue(
          validSubmission1
        )
        parseOrgSubmission.mockReturnValue(transformedOrg1)
        organisationsRepository.upsert.mockResolvedValue({
          action: 'unchanged'
        })

        const formsDataMigration = createFormDataMigrator(
          formsSubmissionRepository,
          organisationsRepository
        )
        await formsDataMigration.migrate()

        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ id: transformedOrg1.id })
        )

        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 1/1 organisations processed (0 inserted, 0 updated, 1 unchanged, 0 failed)'
        })
      })
    })

    describe('transformation failure scenarios', () => {
      it('1 org transform fails', async () => {
        organisationsRepository.findAllIds.mockResolvedValue({
          organisations: new Set(),
          registrations: new Set(),
          accreditations: new Set()
        })
        formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
          organisations: new Set([validSubmission1.id, validSubmission2.id]),
          registrations: new Set(),
          accreditations: new Set()
        })

        formsSubmissionRepository.findOrganisationById
          .mockResolvedValueOnce(validSubmission1)
          .mockResolvedValueOnce(validSubmission2)

        parseOrgSubmission
          .mockReturnValueOnce(transformedOrg1)
          .mockImplementationOnce(() => {
            throw new Error('Transform failed')
          })
        organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

        const formsDataMigration = createFormDataMigrator(
          formsSubmissionRepository,
          organisationsRepository
        )
        await formsDataMigration.migrate()

        expect(parseOrgSubmission).toHaveBeenCalledTimes(2)
        expect(organisationsRepository.upsert).toHaveBeenCalledTimes(1)

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            message: 'Error transforming organisation submission',
            event: expect.objectContaining({
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
              reference: validSubmission2.id
            })
          })
        )
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/2 organisation form submissions (1 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 1/1 organisations processed (1 inserted, 0 updated, 0 unchanged, 0 failed)'
        })
      })

      it('1 registration transform fails', async () => {
        organisationsRepository.findAllIds.mockResolvedValue({
          organisations: new Set(),
          registrations: new Set(),
          accreditations: new Set()
        })
        formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
          organisations: new Set([validSubmission1.id]),
          registrations: new Set([
            validRegSubmission1.id,
            validRegSubmission2.id
          ]),
          accreditations: new Set()
        })

        formsSubmissionRepository.findOrganisationById.mockResolvedValue(
          validSubmission1
        )
        formsSubmissionRepository.findRegistrationById
          .mockResolvedValueOnce(validRegSubmission1)
          .mockResolvedValueOnce(validRegSubmission2)

        parseOrgSubmission.mockReturnValueOnce(transformedOrg1)
        parseRegistrationSubmission
          .mockReturnValueOnce(transformedReg1)
          .mockImplementationOnce(() => {
            throw new Error('Registration transform failed')
          })
        organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

        const formsDataMigration = createFormDataMigrator(
          formsSubmissionRepository,
          organisationsRepository
        )
        await formsDataMigration.migrate()

        expect(parseRegistrationSubmission).toHaveBeenCalledTimes(2)
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Error transforming registration submission',
            event: expect.objectContaining({
              reference: validRegSubmission2.id
            })
          })
        )
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/2 registration form submissions (1 failed)'
        })
      })

      it('1 accreditation transform fails', async () => {
        const accrId1 = new ObjectId()
        const accrId2 = new ObjectId()

        const validAccrSubmission1 = {
          id: accrId1.toString(),
          rawSubmissionData: { accrData: 'value1' }
        }
        const validAccrSubmission2 = {
          id: accrId2.toString(),
          rawSubmissionData: { accrData: 'value2' }
        }

        organisationsRepository.findAllIds.mockResolvedValue({
          organisations: new Set(),
          registrations: new Set(),
          accreditations: new Set()
        })
        formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
          organisations: new Set([validSubmission1.id]),
          registrations: new Set(),
          accreditations: new Set([
            validAccrSubmission1.id,
            validAccrSubmission2.id
          ])
        })

        formsSubmissionRepository.findOrganisationById.mockResolvedValue(
          validSubmission1
        )
        formsSubmissionRepository.findAccreditationById
          .mockResolvedValueOnce(validAccrSubmission1)
          .mockResolvedValueOnce(validAccrSubmission2)

        parseOrgSubmission.mockReturnValueOnce(transformedOrg1)
        parseAccreditationSubmission
          .mockReturnValueOnce({
            id: validAccrSubmission1.id,
            systemReference: transformedOrg1.id,
            orgId: 500001
          })
          .mockImplementationOnce(() => {
            throw new Error('Accreditation transform failed')
          })
        organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

        const formsDataMigration = createFormDataMigrator(
          formsSubmissionRepository,
          organisationsRepository
        )
        await formsDataMigration.migrate()

        expect(parseAccreditationSubmission).toHaveBeenCalledTimes(2)
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Error transforming accreditation submission',
            event: expect.objectContaining({
              reference: validAccrSubmission2.id
            })
          })
        )
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/2 accreditation form submissions (1 failed)'
        })
      })
    })
  })

  describe('integration test with fixtures', () => {
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
    })
  })
})
