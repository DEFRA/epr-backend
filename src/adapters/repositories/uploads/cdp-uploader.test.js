import { describe, expect, vi } from 'vitest'
import { it as baseIt } from '#vite/fixtures/cdp-uploader.js'
import { testUploadsRepositoryContract } from './port.contract.js'
import { createUploadsRepository } from './cdp-uploader.js'

// The cdpUploaderStack fixture brings up a Docker stack (Floci, Redis, an init
// container, CDP Uploader, a Socat proxy) whose own startup timeouts reach 120s.
// The default 60s hook timeout is shorter than that budget, so a cold image pull
// or CPU contention can time the setup hook out before the containers are ready.
vi.setConfig({ hookTimeout: 180_000, testTimeout: 180_000 })

// Extend base fixture with contract test specific fixtures
const it = baseIt.extend({
  uploadsRepository: async (
    { s3Client, cdpUploaderStack },
    /** @type {(repository: import('#domain/uploads/repository/port.js').UploadsRepository) => Promise<void>} */ use
  ) => {
    const repository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: cdpUploaderStack.cdpUploader.url,
      summaryLogsBucket: 're-ex-summary-logs',
      orsBucket: 're-ex-overseas-sites'
    })

    await use(repository)
  },

  performUpload: async (
    { cdpUploaderStack },
    /** @type {(upload: (uploadId: string, buffer: Buffer) => Promise<void>) => Promise<void>} */ use
  ) => {
    await use(async (uploadId, buffer) => {
      const uploadUrlPath = `/upload-and-scan/${uploadId}`

      const formData = new FormData()
      formData.append(
        'file',
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        'summary-log.xlsx'
      )

      const uploadResponse = await fetch(
        `${cdpUploaderStack.cdpUploader.url}${uploadUrlPath}`,
        {
          method: 'POST',
          body: formData,
          redirect: 'manual'
        }
      )

      if (uploadResponse.status !== 302) {
        throw new Error(
          `Expected 302 redirect from CDP Uploader, got ${uploadResponse.status}`
        )
      }

      // Upload initiated - callback will be made when scan completes
    })
  }
})

// Enable callback receiver for contract tests. needsCallbackReceiver is
// file-scoped, so the override must be declared at the top level of the file.
it.scoped({ needsCallbackReceiver: true })

describe('CDP Uploader uploads repository', () => {
  testUploadsRepositoryContract(it)

  // SonarCloud cannot detect dynamically registered contract tests above.
  // This explicit test exists solely to satisfy SonarCloud rule S2187.
  it('registers contract tests via testUploadsRepositoryContract', () => {
    expect(testUploadsRepositoryContract).toBeTypeOf('function')
  })
})
