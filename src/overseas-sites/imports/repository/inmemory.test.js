import { describe, it, expect, beforeEach } from 'vitest'

import {
  createInMemoryOrsImportsRepository,
  createInMemoryOrsImportsRepositoryPlugin
} from './inmemory.js'
import { ORS_IMPORT_STATUS } from '#domain/overseas-sites/import-status.js'

describe('In-memory ORS imports repository', () => {
  let repository

  beforeEach(() => {
    const factory = createInMemoryOrsImportsRepository()
    repository = factory()
  })

  describe('create', () => {
    it('stores and returns the import with timestamps', async () => {
      const result = await repository.create({
        _id: 'import-1',
        status: ORS_IMPORT_STATUS.PENDING,
        files: [{ fileId: 'f1', fileName: 'a.xlsx', s3Uri: 's3://bucket/f1' }]
      })

      expect(result._id).toBe('import-1')
      expect(result.status).toBe(ORS_IMPORT_STATUS.PENDING)
      expect(result.files).toHaveLength(1)
      expect(result.createdAt).toBeDefined()
      expect(result.updatedAt).toBeDefined()
    })
  })

  describe('findById', () => {
    it('returns the import document', async () => {
      await repository.create({
        _id: 'import-1',
        status: ORS_IMPORT_STATUS.PENDING,
        files: []
      })

      const found = await repository.findById('import-1')
      expect(found._id).toBe('import-1')
    })

    it('returns null when not found', async () => {
      const found = await repository.findById('nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('updateStatus', () => {
    it('does nothing when updating status of nonexistent import', async () => {
      await repository.updateStatus('nonexistent', ORS_IMPORT_STATUS.PROCESSING)

      const found = await repository.findById('nonexistent')
      expect(found).toBeNull()
    })

    it('updates the status', async () => {
      await repository.create({
        _id: 'import-1',
        status: ORS_IMPORT_STATUS.PENDING,
        files: []
      })

      await repository.updateStatus('import-1', ORS_IMPORT_STATUS.PROCESSING)

      const after = await repository.findById('import-1')
      expect(after.status).toBe(ORS_IMPORT_STATUS.PROCESSING)
      expect(after.updatedAt).toBeDefined()
    })
  })

  describe('recordFileResult', () => {
    it('sets the result on the specified file by index', async () => {
      await repository.create({
        _id: 'import-1',
        status: ORS_IMPORT_STATUS.PROCESSING,
        files: [
          { fileId: 'f1', fileName: 'a.xlsx', s3Uri: 's3://bucket/f1' },
          { fileId: 'f2', fileName: 'b.xlsx', s3Uri: 's3://bucket/f2' }
        ]
      })

      const result = {
        status: 'success',
        sitesCreated: 3,
        mappingsUpdated: 3,
        registrationNumber: 'EPR/AB1234CD/R1',
        errors: []
      }

      await repository.recordFileResult('import-1', 1, result)

      const doc = await repository.findById('import-1')
      expect(doc.files[0].result).toBeUndefined()
      expect(doc.files[1].result).toEqual(result)
    })

    it('does nothing when recording result for nonexistent import', async () => {
      await repository.recordFileResult('nonexistent', 0, { status: 'success' })

      const found = await repository.findById('nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('createInMemoryOrsImportsRepositoryPlugin', () => {
    it('creates a plugin with the correct name', () => {
      const plugin = createInMemoryOrsImportsRepositoryPlugin()

      expect(plugin.name).toBe('orsImportsRepository')
      expect(plugin.register).toBeTypeOf('function')
    })

    it('registers repository on server', () => {
      const plugin = createInMemoryOrsImportsRepositoryPlugin()

      const mockServer = {
        app: {},
        ext: vi.fn()
      }

      plugin.register(mockServer)

      expect(mockServer.app.orsImportsRepository).toBeDefined()
    })
  })
})
