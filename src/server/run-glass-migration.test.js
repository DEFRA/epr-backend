import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  runGlassMigration,
  migrateGlassOrganisation
} from './run-glass-migration.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

describe('runGlassMigration', () => {
  let mockServer
  let mockRepository
  let mockLock

  beforeEach(() => {
    mockLock = {
      free: vi.fn().mockResolvedValue(undefined)
    }

    mockRepository = {
      findAll: vi.fn(),
      replace: vi.fn().mockResolvedValue(undefined)
    }

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

    await runGlassMigration(mockServer, {
      organisationsRepository: mockRepository
    })

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

    await runGlassMigration(mockServer, {
      organisationsRepository: mockRepository
    })

    expect(mockRepository.replace).not.toHaveBeenCalled()
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')
    mockRepository.findAll.mockRejectedValue(new Error('Database error'))

    // Should not throw
    await expect(
      runGlassMigration(mockServer, { organisationsRepository: mockRepository })
    ).resolves.toBeUndefined()
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

    await runGlassMigration(mockServer, {
      organisationsRepository: mockRepository
    })

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

    await runGlassMigration(mockServer, {
      organisationsRepository: mockRepository
    })

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

  it('should use createOrganisationsRepository when not provided in options', async () => {
    mockServer.featureFlags.getGlassMigrationMode.mockReturnValue('enabled')

    const createdRepository = {
      findAll: vi.fn().mockResolvedValue([]),
      replace: vi.fn()
    }
    createOrganisationsRepository.mockReturnValue(() => createdRepository)

    await runGlassMigration(mockServer)

    expect(createOrganisationsRepository).toHaveBeenCalledWith(mockServer.db)
    expect(createdRepository.findAll).toHaveBeenCalled()
  })

  describe('dry-run mode', () => {
    it('should not call replace when dryRun option is true', async () => {
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

      await runGlassMigration(mockServer, {
        organisationsRepository: mockRepository,
        dryRun: true
      })

      expect(mockRepository.replace).not.toHaveBeenCalled()
      expect(mockLock.free).toHaveBeenCalled()
    })

    it('should still report organisations that would be migrated in dry-run mode', async () => {
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

      const result = await runGlassMigration(mockServer, {
        organisationsRepository: mockRepository,
        dryRun: true
      })

      expect(result).toEqual({
        dryRun: true,
        wouldMigrate: 1,
        total: 2
      })
    })

    it('should return migration results in normal mode', async () => {
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

      const result = await runGlassMigration(mockServer, {
        organisationsRepository: mockRepository,
        dryRun: false
      })

      expect(result).toEqual({
        dryRun: false,
        migrated: 1,
        total: 1
      })
    })

    it('should use dry-run mode from feature flag when dryRun option is not provided', async () => {
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

      const result = await runGlassMigration(mockServer, {
        organisationsRepository: mockRepository
      })

      expect(mockRepository.replace).not.toHaveBeenCalled()
      expect(result).toEqual({
        dryRun: true,
        wouldMigrate: 1,
        total: 1
      })
    })

    it('should migrate normally when mode is enabled and no dryRun option provided', async () => {
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

      const result = await runGlassMigration(mockServer, {
        organisationsRepository: mockRepository
      })

      expect(mockRepository.replace).toHaveBeenCalled()
      expect(result).toEqual({
        dryRun: false,
        migrated: 1,
        total: 1
      })
    })

    it('should allow explicit dryRun option to override feature flag mode', async () => {
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

      const result = await runGlassMigration(mockServer, {
        organisationsRepository: mockRepository,
        dryRun: false
      })

      expect(mockRepository.replace).toHaveBeenCalled()
      expect(result).toEqual({
        dryRun: false,
        migrated: 1,
        total: 1
      })
    })
  })
})

describe('migrateGlassOrganisation', () => {
  it('should return false for organisations that do not need migration', async () => {
    const mockRepo = { replace: vi.fn() }
    const org = {
      id: 'org-1',
      version: 1,
      registrations: [
        {
          registrationNumber: 'REG-2025-PA',
          material: 'paper'
        }
      ],
      accreditations: []
    }

    const result = await migrateGlassOrganisation(org, mockRepo)

    expect(result).toBe(false)
    expect(mockRepo.replace).not.toHaveBeenCalled()
  })

  it('should return true and call replace for organisations needing migration', async () => {
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

    const result = await migrateGlassOrganisation(org, mockRepo)

    expect(result).toBe(true)
    expect(mockRepo.replace).toHaveBeenCalled()
  })
})
