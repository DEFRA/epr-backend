import { portAdapter } from '#plugins/port-adapter.js'
import { createInMemoryFormsFileUploadsRepository } from './inmemory.js'

export function createInMemoryFormsFileUploadsRepositoryPlugin() {
  const repository = createInMemoryFormsFileUploadsRepository()

  return portAdapter({
    provides: 'formsFileUploadsRepository',
    needs: [],
    build: () => () => repository
  })
}
