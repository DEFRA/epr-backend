import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migrateFormsData } from './migrate-forms-data.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

const validSubmission1 = {
  id: 'sub-1',
  orgId: 500001,
  rawSubmissionData: { someData: 'value1' }
}

const validSubmission2 = {
  id: 'sub-2',
  orgId: 500002,
  rawSubmissionData: { someData: 'value2' }
}

const transformedOrg1 = {
  id: 'org-123',
  orgId: 500001,
  companyDetails: { name: 'Test Company 1' }
}

const transformedOrg2 = {
  id: 'org-456',
  orgId: 500002,
  companyDetails: { name: 'Test Company 2' }
}

const validRegSubmission1 = {
  id: 'reg-1',
  rawSubmissionData: { regData: 'value1' }
}

const validRegSubmission2 = {
  id: 'reg-2',
  rawSubmissionData: { regData: 'value2' }
}

const transformedReg1 = {
  id: 'reg-1',
  orgName: 'Test Org 1',
  systemReference: 'REF-001'
}

describe('migrateFormsData', () => {
  let formsSubmissionRepository
  let organisationsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    formsSubmissionRepository = {
      findAllOrganisations: vi.fn(),
      findAllRegistrations: vi.fn()
    }
    organisationsRepository = {
      upsert: vi.fn()
    }
  })

  describe('unit tests with mocked parseOrgSubmission', () => {
    let parseOrgSubmission

    beforeEach(async () => {
      // Import and mock parseOrgSubmission
      const module = await import(
        '#formsubmission/organisation/transform-organisation.js'
      )
      parseOrgSubmission = vi.spyOn(module, 'parseOrgSubmission')
    })

    afterEach(() => {
      // Restore the real implementation after each test
      parseOrgSubmission.mockRestore()
    })

    describe('persistence scenarios', () => {
      it('all org transforms and upsert succeed', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1,
          validSubmission2
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([
          validRegSubmission1
        ])

        const regModule = await import(
          '#formsubmission/registration/transform-registration.js'
        )
        const parseRegistrationSubmission = vi.spyOn(
          regModule,
          'parseRegistrationSubmission'
        )

        parseOrgSubmission
          .mockReturnValueOnce(transformedOrg1)
          .mockReturnValueOnce(transformedOrg2)
        parseRegistrationSubmission.mockReturnValueOnce(transformedReg1)
        organisationsRepository.upsert
          .mockResolvedValueOnce({ action: 'inserted' })
          .mockResolvedValueOnce({ action: 'updated' })

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseOrgSubmission).toHaveBeenCalledTimes(2)
        expect(parseOrgSubmission).toHaveBeenCalledWith(
          validSubmission1.id,
          validSubmission1.orgId,
          validSubmission1.rawSubmissionData
        )
        expect(parseOrgSubmission).toHaveBeenCalledWith(
          validSubmission2.id,
          validSubmission2.orgId,
          validSubmission2.rawSubmissionData
        )

        expect(parseRegistrationSubmission).toHaveBeenCalledTimes(1)
        expect(parseRegistrationSubmission).toHaveBeenCalledWith(
          validRegSubmission1.id,
          validRegSubmission1.rawSubmissionData
        )

        expect(organisationsRepository.upsert).toHaveBeenCalledTimes(2)
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg1
        )
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg2
        )

        expect(logger.error).toHaveBeenCalledWith({
          message: 'Transformed 2/2 organisation form submissions (0 failed)'
        })
        expect(logger.error).toHaveBeenCalledWith({
          message: 'Transformed 1/1 registration form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 2/2 organisations processed (1 inserted, 1 updated, 0 unchanged, 0 failed)'
        })

        parseRegistrationSubmission.mockRestore()
      })

      it('one upsert fails', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([])
        parseOrgSubmission.mockReturnValue(transformedOrg1)
        organisationsRepository.upsert.mockRejectedValue(
          new Error('Upsert failed')
        )

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseOrgSubmission).toHaveBeenCalledWith(
          validSubmission1.id,
          validSubmission1.orgId,
          validSubmission1.rawSubmissionData
        )
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg1
        )

        expect(logger.error).toHaveBeenCalledWith({
          message: 'Transformed 1/1 organisation form submissions (0 failed)'
        })
        expect(logger.error).toHaveBeenCalledWith({
          message: 'Transformed 0/0 registration form submissions (0 failed)'
        })
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

      it('one without any change comparing to whats in db', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([])
        parseOrgSubmission.mockReturnValue(transformedOrg1)
        organisationsRepository.upsert.mockResolvedValue({
          action: 'unchanged'
        })

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseOrgSubmission).toHaveBeenCalledWith(
          validSubmission1.id,
          validSubmission1.orgId,
          validSubmission1.rawSubmissionData
        )
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg1
        )

        expect(logger.error).toHaveBeenCalledWith({
          message: 'Transformed 1/1 organisation form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 1/1 organisations processed (0 inserted, 0 updated, 1 unchanged, 0 failed)'
        })
      })
    })

    describe('transformation failure scenarios', () => {
      it('1 org transform fails', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1,
          validSubmission2
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([])
        parseOrgSubmission
          .mockReturnValueOnce(transformedOrg1)
          .mockImplementationOnce(() => {
            throw new Error('Transform failed')
          })
        organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseOrgSubmission).toHaveBeenCalledTimes(2)
        expect(organisationsRepository.upsert).toHaveBeenCalledTimes(1)
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg1
        )

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
        expect(logger.error).toHaveBeenCalledWith({
          message: 'Transformed 1/2 organisation form submissions (1 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 1/2 organisations processed (1 inserted, 0 updated, 0 unchanged, 0 failed)'
        })
      })

      it('1 registration transform fails', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([
          validRegSubmission1,
          validRegSubmission2
        ])

        const module = await import(
          '#formsubmission/registration/transform-registration.js'
        )
        const parseRegistrationSubmission = vi.spyOn(
          module,
          'parseRegistrationSubmission'
        )

        parseOrgSubmission.mockReturnValueOnce(transformedOrg1)
        parseRegistrationSubmission
          .mockReturnValueOnce(transformedReg1)
          .mockImplementationOnce(() => {
            throw new Error('Registration transform failed')
          })
        organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseOrgSubmission).toHaveBeenCalledTimes(1)
        expect(parseOrgSubmission).toHaveBeenCalledWith(
          validSubmission1.id,
          validSubmission1.orgId,
          validSubmission1.rawSubmissionData
        )

        expect(parseRegistrationSubmission).toHaveBeenCalledTimes(2)
        expect(parseRegistrationSubmission).toHaveBeenCalledWith(
          validRegSubmission1.id,
          validRegSubmission1.rawSubmissionData
        )
        expect(parseRegistrationSubmission).toHaveBeenCalledWith(
          validRegSubmission2.id,
          validRegSubmission2.rawSubmissionData
        )

        expect(organisationsRepository.upsert).toHaveBeenCalledTimes(1)
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg1
        )

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            message: 'Error transforming registration submission',
            event: expect.objectContaining({
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
              reference: validRegSubmission2.id
            })
          })
        )
        expect(logger.error).toHaveBeenCalledWith({
          message: 'Transformed 1/2 registration form submissions (1 failed)'
        })
        expect(logger.error).toHaveBeenCalledWith({
          message: 'Transformed 1/1 organisation form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 1/1 organisations processed (1 inserted, 0 updated, 0 unchanged, 0 failed)'
        })

        parseRegistrationSubmission.mockRestore()
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

      formsInMemoryRepo = createFormSubmissionsRepository(
        [],
        regFormSubmissions,
        orgFormSubmissions
      )()
      organisationsInMemoryRepo = createInMemoryOrganisationsRepository()()
    })

    it('migrates org form submissions from EA fixtures using in-memory repositories', async () => {
      // Run migration
      await migrateFormsData(formsInMemoryRepo, organisationsInMemoryRepo)

      // Verify organisations were created
      const allOrgs = await organisationsInMemoryRepo.findAll()
      expect(allOrgs).toHaveLength(8)

      // Create a map of organisations by orgId for easy lookup
      const orgsByOrgId = allOrgs.reduce(
        (map, org) => map.set(org.orgId, org),
        new Map()
      )

      // Verify registrations exist for specific orgIds
      const orgWithExporterReg = orgsByOrgId.get(503181)
      expect(orgWithExporterReg).toBeDefined()
      expect(orgWithExporterReg.registrations).toBeDefined()
      expect(orgWithExporterReg.registrations).toHaveLength(1)
      expect(orgWithExporterReg.registrations[0].wasteProcessingType).toBe(
        'exporter'
      )

      const orgWithReprocessorReg = orgsByOrgId.get(503176)
      expect(orgWithReprocessorReg).toBeDefined()
      expect(orgWithReprocessorReg.registrations).toBeDefined()
      expect(orgWithReprocessorReg.registrations).toHaveLength(1)
      expect(orgWithReprocessorReg.registrations[0].wasteProcessingType).toBe(
        'reprocessor'
      )
    })
  })
})
