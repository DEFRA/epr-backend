import { describe, it as base, expect } from 'vitest'
import { createInMemoryFormsFileUploadsRepository } from './inmemory.js'
import { testFormsFileUploadsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  formsFileUploadsRepository: async ({}, use) => {
    await use(createInMemoryFormsFileUploadsRepository())
  }
})

describe('InMemoryFormsFileUploadsRepository', () => {
  it('creates a repository instance', ({ formsFileUploadsRepository }) => {
    expect(formsFileUploadsRepository).toBeDefined()
  })

  testFormsFileUploadsRepositoryContract(it)

  describe('initial files', () => {
    it('can be initialized with existing files', async () => {
      const initialFiles = new Map([
        ['existing-file-1', Buffer.from('Content 1')],
        ['existing-file-2', Buffer.from('Content 2')]
      ])

      const repository = createInMemoryFormsFileUploadsRepository({
        initialFiles
      })

      const stream1 = await repository.getFileById('existing-file-1')
      const chunks1 = []
      for await (const chunk of stream1) {
        chunks1.push(chunk)
      }
      expect(Buffer.concat(chunks1).toString()).toBe('Content 1')
    })
  })
})
