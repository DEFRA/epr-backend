import { describe, expect, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { it } from '#vite/fixtures/server-with-db.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { runFormsDataMigration } from './run-forms-data-migration.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

vi.mock(
  '#adapters/sqs-command-executor/sqs-command-executor.plugin.js',
  async () => import('#adapters/sqs-command-executor/mock.plugin.js')
)
vi.mock(
  '#plugins/dlq-admin.js',
  async () => import('#plugins/dlq-admin.mock.plugin.js')
)

describe('the forms data migration on the production server', () => {
  setupAuthContext()

  it('finds every repository it reads', async ({ server }) => {
    const started = /** @type {StartedServer} */ (server)
    const heldLock = await started.locker.lock('forms-data-migration')
    expect(heldLock).not.toBeNull()
    const info = vi.spyOn(logger, 'info')
    const error = vi.spyOn(logger, 'error')

    await runFormsDataMigration(started)
    await heldLock?.free()

    expect(error).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping running form data migration'
    })
  })
})
