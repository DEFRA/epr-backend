import { describe, expect } from 'vitest'
import { it as baseIt } from '#vite/fixtures/cdp-uploader.js'
import { testUploadsRepositoryContract } from './port.contract.js'
import { createUploadsRepository } from './cdp-uploader.js'

// Extend base fixture with contract test specific fixtures
const it = baseIt.extend({
  uploadsRepository: async ({ s3Client, cdpUploaderStack }, use) => {
    const repository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: cdpUploaderStack.cdpUploader.url,
      s3Bucket: 're-ex-summary-logs'
    })

    await use(repository)
  },

  performUpload: async ({ cdpUploaderStack }, use) => {
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

describe('CDP Uploader uploads repository', () => {
  // Enable callback receiver for contract tests - must be called before tests run
  it.scoped({ needsCallbackReceiver: true })

  testUploadsRepositoryContract(it)

  // SonarCloud cannot detect dynamically registered contract tests above.
  // This explicit test exists solely to satisfy SonarCloud rule S2187.
  it('registers contract tests via testUploadsRepositoryContract', () => {
    expect(testUploadsRepositoryContract).toBeTypeOf('function')
  })
})
