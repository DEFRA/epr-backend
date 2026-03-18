import { describe, it, expect, beforeEach } from 'vitest'

import {
  createInMemoryOrsImportsRepository,
  createInMemoryOrsImportsRepositoryPlugin
} from './inmemory.js'
import { ORS_IMPORT_STATUS } from '../../domain/import-status.js'

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
        status: ORS_IMPORT_STATUS.PREPROCESSING,
        files: [{ fileId: 'f1', fileName: 'a.xlsx', s3Uri: 's3://bucket/f1' }]
      })

      expect(result._id).toBe('import-1')
      expect(result.status).toBe(ORS_IMPORT_STATUS.PREPROCESSING)
      expect(result.files).toHaveLength(1)
      expect(result.createdAt).toBeDefined()
      expect(result.updatedAt).toBeDefined()
    })
  })

  describe('findById', () => {
    it('returns the import document', async () => {
      await repository.create({
        _id: 'import-1',
        status: ORS_IMPORT_STATUS.PREPROCESSING,
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
        status: ORS_IMPORT_STATUS.PREPROCESSING,
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

  describe('addFiles', () => {
    it('appends files to the import files array', async () => {
      await repository.create({
        _id: 'import-1',
        status: ORS_IMPORT_STATUS.PREPROCESSING,
        files: []
      })

      const files = [
        { fileId: 'f1', fileName: 'sites.xlsx', s3Uri: 's3://bucket/f1' },
        { fileId: 'f2', fileName: 'more.xlsx', s3Uri: 's3://bucket/f2' }
      ]

      await repository.addFiles('import-1', files)

      const doc = await repository.findById('import-1')
      expect(doc.files).toHaveLength(2)
      expect(doc.files[0]).toEqual(files[0])
      expect(doc.files[1]).toEqual(files[1])
    })

    it('appends to existing files without replacing them', async () => {
      await repository.create({
        _id: 'import-1',
        status: ORS_IMPORT_STATUS.PREPROCESSING,
        files: [{ fileId: 'f1', fileName: 'a.xlsx', s3Uri: 's3://bucket/f1' }]
      })

      await repository.addFiles('import-1', [
        { fileId: 'f2', fileName: 'b.xlsx', s3Uri: 's3://bucket/f2' }
      ])

      const doc = await repository.findById('import-1')
      expect(doc.files).toHaveLength(2)
      expect(doc.files[1].fileId).toBe('f2')
    })

    it('does nothing when import does not exist', async () => {
      await repository.addFiles('nonexistent', [
        { fileId: 'f1', fileName: 'a.xlsx', s3Uri: 's3://bucket/f1' }
      ])

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
