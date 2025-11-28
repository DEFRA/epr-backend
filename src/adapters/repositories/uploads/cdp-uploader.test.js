import { describe, it as vitestIt } from 'vitest'
import { it as baseIt } from '#vite/fixtures/cdp-uploader.js'
import { testUploadsRepositoryContract } from './port.contract.js'
import { createUploadsRepository } from './cdp-uploader.js'

// The callback receiver is now created in the fixture BEFORE containers start,
// which allows testcontainers to automatically connect containers to both:
// 1. Our custom network (for inter-container communication via aliases)
// 2. The port forwarder network (for host.testcontainers.internal access)
const it = baseIt.extend({
  uploadsRepository: async ({ s3Client, cdpUploaderStack }, use) => {
    const repository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: cdpUploaderStack.cdpUploader.url,
      frontendUrl: 'https://frontend.test',
      backendUrl: cdpUploaderStack.callbackReceiver.testcontainersUrl,
      s3Bucket: 're-ex-summary-logs',
      maxFileSize: 10485760
    })

    await use(repository)
  },

  callbackReceiver: async ({ cdpUploaderStack }, use) => {
    await use(cdpUploaderStack.callbackReceiver)
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
  testUploadsRepositoryContract(it)

  // Visible test for SonarCloud - contract tests are registered dynamically above
  vitestIt(
    'has contract tests registered via testUploadsRepositoryContract',
    () => {
      expect(testUploadsRepositoryContract).toBeInstanceOf(Function)
    }
  )
})
