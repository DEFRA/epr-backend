import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  runGlassMigration,
  migrateGlassOrganisation
} from './run-glass-migration.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import * as glassMigration from '#glass-migration/glass-migration.js'
import * as glassMigrationAudit from '#root/auditing/glass-migration.js'

vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn()
}))

describe('runGlassMigration', () => {
  let mockServer
  let mockRepository
  let mockSystemLogsRepository
  let mockLock
  let auditSpy

  beforeEach(() => {
    mockLock = {
      free: vi.fn().mockResolvedValue(undefined)
    }

    mockRepository = {
      findAll: vi.fn().mockResolvedValue([]),
      replace: vi.fn().mockResolvedValue(undefined)
    }

    mockSystemLogsRepository = {
      insert: vi.fn().mockResolvedValue(undefined)
    }

    createOrganisationsRepository.mockReturnValue(() => mockRepository)
    createSystemLogsRepository.mockResolvedValue(() => mockSystemLogsRepository)

    auditSpy = vi
      .spyOn(glassMigrationAudit, 'auditGlassMigration')
      .mockResolvedValue(undefined)

    mockServer = {
      featureFlags: {
        getGlassMigrationMode: vi.fn().mockReturnValue('disabled')
      },
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      },
      db: {}
    }
  })

  it('should skip migration when feature flag is disabled', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('disabled')

    await runGlassMigration(mockServer)

    expect(mockServer.locker.lock).not.toHaveBeenCalled()
  })

  it('should skip migration when unable to obtain lock', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')
    mockServer.locker.lock.mockResolvedValue(null)

    await runGlassMigration(mockServer)

    expect(mockRepository.findAll).not.toHaveBeenCalled()
  })

  it('should migrate organisations with glass registrations needing migration', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')
    const originalOrg = {
      id: 'org-1',
      version: 1,
      registrations: [
        {
          id: 'reg-1',
          registrationNumber: 'REG-2025-GL',
          material: 'glass',
          glassRecyclingProcess: ['glass_re_melt']
        }
      ],
      accreditations: []
    }
    mockRepository.findAll.mockResolvedValue([originalOrg])

    await runGlassMigration(mockServer)

    expect(mockRepository.replace).toHaveBeenCalledWith(
      'org-1',
      1,
      expect.objectContaining({
        registrations: expect.arrayContaining([
          expect.objectContaining({
            registrationNumber: 'REG-2025-GR'
          })
        ])
      })
    )
    expect(auditSpy).toHaveBeenCalledWith(
      mockSystemLogsRepository,
      'org-1',
      { registrations: originalOrg.registrations, accreditations: [] },
      expect.objectContaining({
        registrations: expect.arrayContaining([
          expect.objectContaining({ registrationNumber: 'REG-2025-GR' })
        ])
      })
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should skip organisations that do not need migration', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')
    mockRepository.findAll.mockResolvedValue([
      {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-PA',
            material: 'paper'
          }
        ],
        accreditations: []
      }
    ])

    await runGlassMigration(mockServer)

    expect(mockRepository.replace).not.toHaveBeenCalled()
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')
    mockRepository.findAll.mockRejectedValue(new Error('Database error'))

    await expect(runGlassMigration(mockServer)).resolves.toBeUndefined()
  })

  it('should release lock even when migration fails', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')
    mockRepository.findAll.mockResolvedValue([
      {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ],
        accreditations: []
      }
    ])
    mockRepository.replace.mockRejectedValue(new Error('Replace failed'))

    await runGlassMigration(mockServer)

    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should migrate multiple organisations', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')
    mockRepository.findAll.mockResolvedValue([
      {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ],
        accreditations: []
      },
      {
        id: 'org-2',
        version: 2,
        registrations: [
          {
            id: 'reg-2',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_other']
          }
        ],
        accreditations: []
      }
    ])

    await runGlassMigration(mockServer)

    expect(mockRepository.replace).toHaveBeenCalledTimes(2)
    expect(mockRepository.replace).toHaveBeenCalledWith(
      'org-1',
      1,
      expect.objectContaining({
        registrations: expect.arrayContaining([
          expect.objectContaining({ registrationNumber: 'REG-2025-GR' })
        ])
      })
    )
    expect(mockRepository.replace).toHaveBeenCalledWith(
      'org-2',
      2,
      expect.objectContaining({
        registrations: expect.arrayContaining([
          expect.objectContaining({ registrationNumber: 'REG-2025-GO' })
        ])
      })
    )
  })

  it('should create repository using server.db', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')

    await runGlassMigration(mockServer)

    expect(createOrganisationsRepository).toHaveBeenCalledWith(mockServer.db)
  })

  describe('dry-run mode', () => {
    it('should not call replace when mode is dry-run', async () => {
      mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('dry-run')
      mockRepository.findAll.mockResolvedValue([
        {
          id: 'org-1',
          version: 1,
          registrations: [
            {
              id: 'reg-1',
              registrationNumber: 'REG-2025-GL',
              material: 'glass',
              glassRecyclingProcess: ['glass_re_melt']
            }
          ],
          accreditations: []
        }
      ])

      await runGlassMigration(mockServer)

      expect(mockRepository.replace).not.toHaveBeenCalled()
      expect(mockLock.free).toHaveBeenCalled()
    })

    it('should report organisations that would be migrated in dry-run mode', async () => {
      mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('dry-run')
      mockRepository.findAll.mockResolvedValue([
        {
          id: 'org-1',
          version: 1,
          registrations: [
            {
              id: 'reg-1',
              registrationNumber: 'REG-2025-GL',
              material: 'glass',
              glassRecyclingProcess: ['glass_re_melt']
            }
          ],
          accreditations: []
        },
        {
          id: 'org-2',
          version: 1,
          registrations: [
            {
              id: 'reg-2',
              registrationNumber: 'REG-2025-PA',
              material: 'paper'
            }
          ],
          accreditations: []
        }
      ])

      const result = await runGlassMigration(mockServer)

      expect(result).toEqual({
        dryRun: true,
        wouldMigrate: 1,
        total: 2
      })
    })

    it('should return migration results when mode is enabled', async () => {
      mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')
      mockRepository.findAll.mockResolvedValue([
        {
          id: 'org-1',
          version: 1,
          registrations: [
            {
              id: 'reg-1',
              registrationNumber: 'REG-2025-GL',
              material: 'glass',
              glassRecyclingProcess: ['glass_re_melt']
            }
          ],
          accreditations: []
        }
      ])

      const result = await runGlassMigration(mockServer)

      expect(result).toEqual({
        dryRun: false,
        migrated: 1,
        total: 1
      })
    })
  })
})

describe('migrateGlassOrganisation', () => {
  describe('with in-memory repository (contract validation)', () => {
    let repository

    beforeEach(() => {
      repository = createInMemoryOrganisationsRepository()()
    })

    it('should return false for organisations that do not need migration', async () => {
      // Build a valid organisation with paper registration (no migration needed)
      const orgData = buildOrganisation()
      await repository.insert(orgData)
      const org = await repository.findById(orgData.id)

      const result = await migrateGlassOrganisation(org, repository)

      expect(result).toBe(false)
    })

    it('should migrate glass registration and pass contract validation', async () => {
      // Build organisation with glass registration needing migration
      const glassReg = buildRegistration({
        material: 'glass',
        registrationNumber: 'REG-2025-GL',
        glassRecyclingProcess: ['glass_re_melt']
      })
      const orgData = buildOrganisation()
      orgData.registrations = [glassReg]
      await repository.insert(orgData)

      const org = await repository.findById(orgData.id)

      // This would have failed with the old code due to 'id: any.unknown' validation error
      const result = await migrateGlassOrganisation(org, repository)

      expect(result).toBe(true)

      // Verify the migration actually worked
      const updated = await repository.findById(orgData.id, 2)
      expect(updated.registrations[0].registrationNumber).toBe('REG-2025-GR')
    })
  })

  describe('error handling (with mocks)', () => {
    it('should return false when migration transformation fails', async () => {
      const mockRepo = { replace: vi.fn() }
      // Minimal org data that passes shouldMigrateOrganisation but fails migrateOrganisation
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: null // Invalid - will cause migrateOrganisation to throw
          }
        ],
        accreditations: []
      }

      const result = await migrateGlassOrganisation(org, mockRepo)

      expect(result).toBe(false)
      expect(mockRepo.replace).not.toHaveBeenCalled()
    })
    it('should handle migration result with undefined arrays gracefully', async () => {
      const mockRepo = { replace: vi.fn().mockResolvedValue(undefined) }
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ],
        accreditations: []
      }

      // Mock migrateOrganisation to return object without arrays
      vi.spyOn(glassMigration, 'migrateOrganisation').mockReturnValueOnce({})

      const result = await migrateGlassOrganisation(org, mockRepo)

      expect(result).toBe(true)
      expect(mockRepo.replace).toHaveBeenCalled()

      vi.restoreAllMocks()
    })
  })
})
