import Hapi from '@hapi/hapi'
import { describe, expect, it } from 'vitest'

import { formsFileUploadsRepositoryPlugin } from './s3.plugin.js'

/** @import { ServerApp } from '#common/hapi-types.js' */

describe('formsFileUploadsRepositoryPlugin', () => {
  it('provides the forms file uploads port', async () => {
    const server = Hapi.server()
    await server.register({
      plugin: formsFileUploadsRepositoryPlugin,
      options: {
        s3: {
          region: 'eu-west-2',
          endpoint: 'http://127.0.0.1:4566',
          forcePathStyle: true
        },
        formsSubmissionApi: {
          url: 'https://forms-submission-api.example',
          s3Bucket: 'form-uploads',
          cognitoClientId: 'client-id',
          cognitoClientSecret: 'client-secret',
          cognitoTokenUrl: 'https://cognito.example/oauth2/token'
        },
        regulators: { EA: { email: 'ea@example.com' } }
      }
    })

    await server.initialize()

    const { formsFileUploadsRepository } = /** @type {ServerApp} */ (server.app)
    expect(formsFileUploadsRepository).toEqual({
      copyFormFileToS3: expect.any(Function),
      getFileById: expect.any(Function)
    })
  })
})
